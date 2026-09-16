/**
 * PRD §7.1 and §7.4 — the deterministic half of evaluation.
 *
 * Pure functions, no I/O, no LLM. This exists so that half of every score can
 * be recomputed by hand and defended without appealing to a model's judgement.
 * The pace band is carried over verbatim from the written project (Chapter 4.7)
 * so it still maps to what was submitted.
 */

// ── tunables (PRD: "weights live in one exported const") ──────────────────

/** Words per minute. 100 inside this band, linear falloff outside. */
export const PACE_BAND = { min: 120, max: 160 } as const;

/** WPM distance from the band at which the pace score reaches zero. */
export const PACE_FALLOFF_WPM = 80;

export const SCORE_WEIGHTS = {
  relevance: 0.4,
  clarity: 0.25,
  structure: 0.2,
  pace: 0.15,
} as const;

/** PRD §7.1 filler list, verbatim. Order matters: longer phrases match first. */
export const FILLER_PHRASES = [
  'you know',
  'sort of',
  'kind of',
  'basically',
  'actually',
  'like',
  'um',
  'uh',
] as const;

// ── word counting ─────────────────────────────────────────────────────────

/**
 * Counts words the way a person would: hyphenated and apostrophised words are
 * one word, numbers count, punctuation does not.
 */
export function countWords(transcript: string): number {
  const matches = transcript.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

export function wordsPerMinute(wordCount: number, speakingTimeMs: number): number | null {
  // Under a second of audio cannot produce a meaningful rate — a single word in
  // 200ms would read as 300 WPM and poison the session average.
  if (speakingTimeMs < 1000 || wordCount === 0) return null;
  return (wordCount / (speakingTimeMs / 60000));
}

// ── pace ──────────────────────────────────────────────────────────────────

/**
 * 100 inside the band, falling linearly to 0 at PACE_FALLOFF_WPM beyond either
 * edge. A typed answer has no pace, which is why null is a valid input and
 * yields null rather than 0 — scoring a typed answer 0 for pace would be a bug
 * that quietly punishes the accessibility path (PRD §6.5).
 */
export function paceScore(wpm: number | null): number | null {
  if (wpm === null) return null;

  if (wpm >= PACE_BAND.min && wpm <= PACE_BAND.max) return 100;

  const distance = wpm < PACE_BAND.min ? PACE_BAND.min - wpm : wpm - PACE_BAND.max;
  const score = 100 * (1 - distance / PACE_FALLOFF_WPM);
  return clamp(Math.round(score), 0, 100);
}

// ── fillers ───────────────────────────────────────────────────────────────

export interface FillerAnalysis {
  fillerCount: number;
  /** Fillers ÷ total words. 0 when there are no words. */
  fillerRate: number;
  byPhrase: Record<string, number>;
}

/**
 * Counts filler words on whole-word boundaries.
 *
 * "like" is the awkward one: it is a filler in "it was, like, really hard" and
 * ordinary English in "I like Python" or "something like that". Counting every
 * occurrence would punish normal speech, so "like" is only counted when it is
 * not doing obvious grammatical work.
 */
export function analyseFillers(transcript: string, wordCount?: number): FillerAnalysis {
  const text = ` ${transcript.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ')} `;
  const byPhrase: Record<string, number> = {};
  let fillerCount = 0;

  for (const phrase of FILLER_PHRASES) {
    const pattern =
      phrase === 'like'
        ? // Not preceded by a verb/pronoun that makes it meaningful, and not
          // followed by a noun phrase it would be introducing.
          /(?<!\b(?:i|we|they|you|he|she|it|would|really|don't|doesn't|didn't|just)\s)\blike\b(?!\s+(?:this|that|it|these|those|a|an|the|to)\b)/g
        : new RegExp(`\\b${phrase.replace(/ /g, '\\s+')}\\b`, 'g');

    const hits = text.match(pattern);
    if (hits && hits.length > 0) {
      byPhrase[phrase] = hits.length;
      fillerCount += hits.length;
    }
  }

  const words = wordCount ?? countWords(transcript);
  return {
    fillerCount,
    fillerRate: words > 0 ? fillerCount / words : 0,
    byPhrase,
  };
}

// ── turn metrics ──────────────────────────────────────────────────────────

export interface MetricsInput {
  transcript: string;
  speakingTimeMs: number | null;
  thinkingTimeMs: number | null;
}

export interface DeterministicMetrics {
  wordCount: number;
  wpm: number | null;
  fillerCount: number;
  fillerRate: number;
  paceScore: number | null;
  thinkingTimeMs: number | null;
}

export function computeMetrics(input: MetricsInput): DeterministicMetrics {
  const wordCount = countWords(input.transcript);
  const wpm = input.speakingTimeMs === null ? null : wordsPerMinute(wordCount, input.speakingTimeMs);
  const fillers = analyseFillers(input.transcript, wordCount);

  return {
    wordCount,
    wpm: wpm === null ? null : Math.round(wpm),
    fillerCount: fillers.fillerCount,
    fillerRate: Number(fillers.fillerRate.toFixed(4)),
    paceScore: paceScore(wpm),
    thinkingTimeMs: input.thinkingTimeMs,
  };
}

// ── aggregation (PRD §7.4) ────────────────────────────────────────────────

export interface JudgedScores {
  relevance: number;
  clarity: number;
  structure: number;
}

/**
 * turnScore = 0.40*relevance + 0.25*clarity + 0.20*structure + 0.15*paceScore
 *
 * When pace is unavailable (a typed answer), its weight is redistributed across
 * the remaining three rather than counted as zero — otherwise every typed
 * answer would be capped at 85.
 */
export function turnScore(judged: JudgedScores, pace: number | null): number {
  const r = clamp(judged.relevance, 0, 100);
  const c = clamp(judged.clarity, 0, 100);
  const s = clamp(judged.structure, 0, 100);

  if (pace === null) {
    const w = SCORE_WEIGHTS.relevance + SCORE_WEIGHTS.clarity + SCORE_WEIGHTS.structure;
    return round1(
      (SCORE_WEIGHTS.relevance * r + SCORE_WEIGHTS.clarity * c + SCORE_WEIGHTS.structure * s) / w,
    );
  }

  return round1(
    SCORE_WEIGHTS.relevance * r +
      SCORE_WEIGHTS.clarity * c +
      SCORE_WEIGHTS.structure * s +
      SCORE_WEIGHTS.pace * clamp(pace, 0, 100),
  );
}

export function sessionScore(turnScores: number[]): number {
  if (turnScores.length === 0) return 0;
  return round1(turnScores.reduce((a, b) => a + b, 0) / turnScores.length);
}

export function averageSubScores(
  turns: Array<{ relevance: number; clarity: number; structure: number; pace: number | null }>,
): { relevance: number; clarity: number; structure: number; pace: number } {
  if (turns.length === 0) return { relevance: 0, clarity: 0, structure: 0, pace: 0 };

  const mean = (pick: (t: (typeof turns)[number]) => number | null) => {
    const values = turns.map(pick).filter((v): v is number => v !== null);
    if (values.length === 0) return 0;
    return round1(values.reduce((a, b) => a + b, 0) / values.length);
  };

  return {
    relevance: mean((t) => t.relevance),
    clarity: mean((t) => t.clarity),
    structure: mean((t) => t.structure),
    pace: mean((t) => t.pace),
  };
}

// ── helpers ───────────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
