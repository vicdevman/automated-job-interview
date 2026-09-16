import type { Level } from '@/lib/db/models';

/**
 * PRD §7.3 — adaptive difficulty.
 *
 * A deterministic control policy over a rolling window of the last two turn
 * scores. Explicitly NOT reinforcement learning: the written objective names
 * RL, but nothing here learns from reward, and calling it RL would be a
 * misrepresentation in the defence. It is an adaptive control policy —
 * explainable, debuggable, and every transition is logged with its trigger.
 */

export const DIFFICULTY_THRESHOLDS = {
  /** Rolling mean at or above this promotes the candidate. */
  up: 80,
  /** Rolling mean at or below this demotes them. */
  down: 45,
  /** How many recent turns the decision looks at. */
  window: 2,
} as const;

const LADDER: Level[] = ['junior', 'mid', 'senior'];

export function levelIndex(level: Level): number {
  const i = LADDER.indexOf(level);
  return i === -1 ? 1 : i;
}

export function stepLevel(level: Level, direction: 1 | -1): Level {
  const next = levelIndex(level) + direction;
  // Capped at senior, floored at junior.
  return LADDER[Math.min(LADDER.length - 1, Math.max(0, next))] ?? level;
}

export interface DifficultyDecision {
  next: Level;
  changed: boolean;
  /** Human-readable reason, persisted on the session so the behaviour is demonstrable. */
  trigger: string;
  /**
   * PRD §7.3: when difficulty holds and points were missed, the next question
   * follows up on the same competency instead of moving to a new topic.
   */
  shouldFollowUp: boolean;
}

export interface DifficultyInput {
  current: Level;
  /** Turn totals, oldest first. Only the last `window` are considered. */
  recentScores: number[];
  /** From the most recent turn's evaluation. */
  missedPoints: string[];
}

export function decideDifficulty(input: DifficultyInput): DifficultyDecision {
  const window = input.recentScores.slice(-DIFFICULTY_THRESHOLDS.window);

  // Not enough evidence yet — one good answer is luck, not a trend.
  if (window.length < DIFFICULTY_THRESHOLDS.window) {
    return {
      next: input.current,
      changed: false,
      trigger: `holding at ${input.current}: only ${window.length} of ${DIFFICULTY_THRESHOLDS.window} turns scored so far`,
      shouldFollowUp: input.missedPoints.length > 0,
    };
  }

  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const rounded = Math.round(mean * 10) / 10;

  if (mean >= DIFFICULTY_THRESHOLDS.up) {
    const next = stepLevel(input.current, 1);
    const atCeiling = next === input.current;
    return {
      next,
      changed: !atCeiling,
      trigger: atCeiling
        ? `already at senior: last ${window.length} turns averaged ${rounded}`
        : `last ${window.length} turns averaged ${rounded} (>= ${DIFFICULTY_THRESHOLDS.up}), raising ${input.current} to ${next}`,
      // A promotion is a new topic, never a follow-up — they have shown they
      // covered this one.
      shouldFollowUp: false,
    };
  }

  if (mean <= DIFFICULTY_THRESHOLDS.down) {
    const next = stepLevel(input.current, -1);
    const atFloor = next === input.current;
    return {
      next,
      changed: !atFloor,
      trigger: atFloor
        ? `already at junior: last ${window.length} turns averaged ${rounded}`
        : `last ${window.length} turns averaged ${rounded} (<= ${DIFFICULTY_THRESHOLDS.down}), lowering ${input.current} to ${next}`,
      shouldFollowUp: false,
    };
  }

  return {
    next: input.current,
    changed: false,
    trigger: `holding at ${input.current}: last ${window.length} turns averaged ${rounded}`,
    shouldFollowUp: input.missedPoints.length > 0,
  };
}
