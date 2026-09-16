/**
 * PRD §3.2 — LLM contract.
 *
 * Every LLM call in this application returns structured JSON. There is no
 * free-text model output anywhere in the product, which is what makes the
 * evaluation reproducible and the grounding checks possible.
 *
 * Adapters own the messy part: stripping code fences and retrying malformed
 * JSON once before throwing. Calling code never parses JSON itself.
 */

export interface LlmCompletionRequest {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  /** Providers with native structured output use this; others get it appended to the system prompt. */
  jsonSchema?: object;
  maxTokens?: number;
}

export interface LlmProvider {
  readonly id: string;
  readonly defaultModel: string;
  complete<T>(req: LlmCompletionRequest): Promise<T>;
}

/** Thrown when a provider cannot be coaxed into returning valid JSON. */
export class LlmFormatError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = 'LlmFormatError';
  }
}
