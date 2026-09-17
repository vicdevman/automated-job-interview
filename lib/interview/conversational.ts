/**
 * Small client-side heuristics that make the interview feel like a
 * conversation rather than a form being filled in.
 *
 * This file is deliberately tiny. The LLM (see prompts.ts) carries the real
 * conversational judgment — whether an answer is complete, whether to follow
 * up, how to phrase a transition. What lives here is the one thing that must
 * be instant and must never cost a network round trip: recognising "sorry,
 * can you repeat that?" so the interviewer can just say the question again
 * instead of scoring "sorry can you repeat that" as a failed answer.
 */

/**
 * Phrases that mean "I didn't hear/understand the question", not "here is my
 * answer". Matched only against SHORT utterances — a long answer that happens
 * to contain the word "repeat" (e.g. "I had to repeat the deployment steps
 * three times") must never be caught by this.
 */
const REPEAT_PATTERNS: RegExp[] = [
  /\b(repeat|say)\s+(that|it|the question)?\s*(again|once more|one more time)?\b/i,
  /\bcome again\b/i,
  /\b(sorry|pardon|excuse me)[,.]?\s*(what|could you|can you|what was that)/i,
  /\bwhat was the question\b/i,
  /\bdidn'?t (catch|hear|get) (that|you|the question)\b/i,
  /\b(could|can) you (please )?repeat\b/i,
  /\bone more time\b/i,
  /\bi missed (that|the question)\b/i,
  /^(what|huh|sorry|pardon)\??$/i,
];

/** Above this many words, treat it as a real answer even if it mentions "repeat". */
const MAX_REPEAT_REQUEST_WORDS = 14;

export function detectRepeatRequest(transcript: string): boolean {
  const trimmed = transcript.trim();
  if (!trimmed) return false;

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > MAX_REPEAT_REQUEST_WORDS) return false;

  return REPEAT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Varied so repeating a question twice in one interview doesn't sound canned. */
const REPEAT_LEAD_INS = [
  'Of course.',
  'Sure, let me say that again.',
  'No problem.',
  "Sure, here it is again.",
];

export function pickRepeatLeadIn(): string {
  return REPEAT_LEAD_INS[Math.floor(Math.random() * REPEAT_LEAD_INS.length)]!;
}
