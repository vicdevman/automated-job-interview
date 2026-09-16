import 'server-only';
import type { LlmProvider, LlmCompletionRequest } from './types';
import { ProviderError } from '../errors';
import { jsonInstruction, parseJsonStrict, withJsonRetry } from './json';
import { env, requireEnv } from '@/lib/env';

/**
 * PRD §3.2 acceptance test — the second LLM adapter.
 *
 * Its purpose is to prove that adding a provider costs exactly four edits:
 * this file, one line in registry.ts, one env var, one zod field. Nothing in
 * app/, components/ or lib/interview/ knows this file exists.
 *
 * Deliberately written against Gemini's REST endpoint rather than its SDK, so
 * the proof does not depend on a new dependency either.
 */

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string; code?: number };
}

export const geminiLlm: LlmProvider = {
  id: 'gemini',
  defaultModel: env.GEMINI_MODEL || 'gemini-2.0-flash',

  async complete<T>(req: LlmCompletionRequest): Promise<T> {
    const apiKey = requireEnv('GEMINI_API_KEY');

    return withJsonRetry(async (correction) => {
      const model = req.model ?? geminiLlm.defaultModel;
      const system = req.system + jsonInstruction(req.jsonSchema) + (correction ? `\n\n${correction}` : '');

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: req.user }] }],
            generationConfig: {
              temperature: req.temperature ?? 0.4,
              maxOutputTokens: req.maxTokens ?? 2048,
              // Gemini's native structured-output switch.
              responseMimeType: 'application/json',
            },
          }),
          cache: 'no-store',
        },
      );

      const body = (await response.json().catch(() => ({}))) as GeminiResponse;

      if (!response.ok) {
        throw new ProviderError('gemini', response.status, body.error?.message ?? 'Request failed.');
      }

      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) {
        const reason = body.candidates?.[0]?.finishReason ?? 'no content';
        throw new ProviderError('gemini', 502, `Model returned nothing (${reason}).`);
      }

      return parseJsonStrict<T>(text);
    });
  },
};
