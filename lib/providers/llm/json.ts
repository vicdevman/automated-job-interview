import { LlmFormatError } from './types';

/**
 * Shared JSON-recovery helpers for LLM adapters.
 *
 * PRD §3.2 puts this burden on the adapter, not on calling code: "Adapters are
 * responsible for stripping code fences and retrying malformed JSON once before
 * throwing. No JSON parsing logic in calling code."
 *
 * Lives beside the adapters rather than inside one so a new provider gets the
 * same behaviour for free — which is the point of the four-step provider rule.
 */

/** Strips markdown fences and any prose the model wrapped around the object. */
export function extractJson(raw: string): string {
  let text = raw.trim();

  // ```json ... ``` or ``` ... ```
  const fence = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fence?.[1]) text = fence[1].trim();

  // Some models still prepend "Here is the JSON:". Fall back to the outermost
  // brace or bracket pair.
  if (!text.startsWith('{') && !text.startsWith('[')) {
    const firstObject = text.indexOf('{');
    const firstArray = text.indexOf('[');
    const candidates = [firstObject, firstArray].filter((i) => i !== -1);
    if (candidates.length > 0) {
      const start = Math.min(...candidates);
      const closer = text[start] === '{' ? '}' : ']';
      const end = text.lastIndexOf(closer);
      if (end > start) text = text.slice(start, end + 1);
    }
  }

  return text.trim();
}

export function parseJsonStrict<T>(raw: string): T {
  const text = extractJson(raw);
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new LlmFormatError(
      `Model did not return valid JSON: ${e instanceof Error ? e.message : String(e)}`,
      raw.slice(0, 1000),
    );
  }
}

/**
 * Appended to the system prompt for providers without native structured output.
 * Deliberately blunt — politeness costs accuracy here.
 */
export function jsonInstruction(schema?: object): string {
  const base =
    '\n\nRespond with a single valid JSON object and nothing else. ' +
    'No markdown code fences, no commentary before or after, no trailing commas.';
  if (!schema) return base;
  return `${base}\n\nThe object must match this JSON Schema:\n${JSON.stringify(schema)}`;
}

/**
 * Runs `attempt`, and on a JSON failure runs it once more with a corrective
 * nudge. One retry, as the PRD specifies — a model that fails twice is failing
 * for a reason a third try will not fix.
 */
export async function withJsonRetry<T>(
  attempt: (correction: string | null) => Promise<T>,
): Promise<T> {
  try {
    return await attempt(null);
  } catch (e) {
    if (!(e instanceof LlmFormatError)) throw e;
    return attempt(
      'Your previous response was not valid JSON. Return ONLY the JSON object, ' +
        'starting with { and ending with }.',
    );
  }
}
