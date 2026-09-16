import 'server-only';
import Groq from 'groq-sdk';
import type { LlmProvider, LlmCompletionRequest } from './types';
import { ProviderError } from '../errors';
import { jsonInstruction, parseJsonStrict, withJsonRetry } from './json';
import { env, requireEnv } from '@/lib/env';

/**
 * PRD §3.2 — Groq adapter. The only file in the codebase that may import
 * `groq-sdk`.
 *
 * Groq supports OpenAI-style `response_format: { type: 'json_object' }`, which
 * is used rather than relying on prompt discipline alone. The schema itself is
 * still described in the prompt, because Groq's JSON mode guarantees
 * well-formed JSON, not a particular shape.
 */

let cached: Groq | null = null;

function client(): Groq {
  if (!cached) {
    cached = new Groq({ apiKey: requireEnv('GROQ_API_KEY') });
  }
  return cached;
}

export const groqLlm: LlmProvider = {
  id: 'groq',
  defaultModel: env.GROQ_MODEL || 'openai/gpt-oss-120b',

  async complete<T>(req: LlmCompletionRequest): Promise<T> {
    return withJsonRetry(async (correction) => {
      const system = req.system + jsonInstruction(req.jsonSchema) + (correction ? `\n\n${correction}` : '');

      let response;
      try {
        response = await client().chat.completions.create({
          model: req.model ?? groqLlm.defaultModel,
          temperature: req.temperature ?? 0.4,
          // Reasoning models (gpt-oss-*) spend tokens on reasoning before the
          // first character of JSON appears, and those count against this
          // budget. Too low and the model runs out mid-document, which Groq
          // reports as json_validate_failed rather than a length error.
          max_tokens: req.maxTokens ?? 8192,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: req.user },
          ],
        });
      } catch (e) {
        const status =
          typeof e === 'object' && e !== null && 'status' in e ? Number((e as { status: unknown }).status) : 502;
        throw new ProviderError('groq', status, e instanceof Error ? e.message : String(e));
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new ProviderError('groq', 502, 'Model returned an empty response.');
      }

      return parseJsonStrict<T>(content);
    });
  },
};
