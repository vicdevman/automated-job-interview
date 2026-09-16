import { describe, it, expect } from 'vitest';
import { decideDifficulty, DIFFICULTY_THRESHOLDS, stepLevel } from './difficulty';

/**
 * These tests are the evidence for acceptance criterion 4 (PRD §15):
 * "Difficulty demonstrably rises after two strong answers and falls after two
 * weak ones, with the change visible in the session log."
 */

describe('stepLevel', () => {
  it('walks the ladder', () => {
    expect(stepLevel('junior', 1)).toBe('mid');
    expect(stepLevel('mid', 1)).toBe('senior');
    expect(stepLevel('senior', -1)).toBe('mid');
    expect(stepLevel('mid', -1)).toBe('junior');
  });

  it('caps at senior and floors at junior', () => {
    expect(stepLevel('senior', 1)).toBe('senior');
    expect(stepLevel('junior', -1)).toBe('junior');
  });
});

describe('decideDifficulty (PRD §7.3)', () => {
  it('holds until the window is full', () => {
    const d = decideDifficulty({ current: 'mid', recentScores: [95], missedPoints: [] });
    expect(d.changed).toBe(false);
    expect(d.next).toBe('mid');
    expect(d.trigger).toContain('only 1 of 2');
  });

  it('raises difficulty after two strong answers', () => {
    const d = decideDifficulty({ current: 'mid', recentScores: [82, 88], missedPoints: [] });
    expect(d.changed).toBe(true);
    expect(d.next).toBe('senior');
    expect(d.trigger).toContain('raising mid to senior');
  });

  it('lowers difficulty after two weak answers', () => {
    const d = decideDifficulty({ current: 'mid', recentScores: [40, 30], missedPoints: [] });
    expect(d.changed).toBe(true);
    expect(d.next).toBe('junior');
    expect(d.trigger).toContain('lowering mid to junior');
  });

  it('holds in the middle band', () => {
    const d = decideDifficulty({ current: 'mid', recentScores: [60, 70], missedPoints: [] });
    expect(d.changed).toBe(false);
    expect(d.next).toBe('mid');
  });

  it('treats the thresholds as inclusive', () => {
    expect(
      decideDifficulty({ current: 'mid', recentScores: [80, 80], missedPoints: [] }).changed,
    ).toBe(true);
    expect(
      decideDifficulty({ current: 'mid', recentScores: [45, 45], missedPoints: [] }).changed,
    ).toBe(true);
  });

  it('does not change just outside the thresholds', () => {
    expect(
      decideDifficulty({ current: 'mid', recentScores: [79.9, 79.9], missedPoints: [] }).changed,
    ).toBe(false);
    expect(
      decideDifficulty({ current: 'mid', recentScores: [45.1, 45.1], missedPoints: [] }).changed,
    ).toBe(false);
  });

  it('only looks at the most recent window', () => {
    // Two terrible early answers must not drag down a recovered candidate.
    const d = decideDifficulty({
      current: 'mid',
      recentScores: [10, 10, 10, 90, 95],
      missedPoints: [],
    });
    expect(d.next).toBe('senior');
  });

  it('reports the ceiling instead of silently doing nothing', () => {
    const d = decideDifficulty({ current: 'senior', recentScores: [95, 95], missedPoints: [] });
    expect(d.changed).toBe(false);
    expect(d.next).toBe('senior');
    expect(d.trigger).toContain('already at senior');
  });

  it('reports the floor', () => {
    const d = decideDifficulty({ current: 'junior', recentScores: [10, 10], missedPoints: [] });
    expect(d.changed).toBe(false);
    expect(d.trigger).toContain('already at junior');
  });

  it('follows up on the same competency when holding with missed points', () => {
    const d = decideDifficulty({
      current: 'mid',
      recentScores: [60, 65],
      missedPoints: ['did not describe the outcome'],
    });
    expect(d.changed).toBe(false);
    expect(d.shouldFollowUp).toBe(true);
  });

  it('does not follow up when holding with nothing missed', () => {
    const d = decideDifficulty({ current: 'mid', recentScores: [60, 65], missedPoints: [] });
    expect(d.shouldFollowUp).toBe(false);
  });

  it('moves on rather than following up when difficulty changes', () => {
    // Promotion means the topic was covered; re-asking it would be perverse.
    const up = decideDifficulty({
      current: 'mid',
      recentScores: [90, 90],
      missedPoints: ['something'],
    });
    expect(up.changed).toBe(true);
    expect(up.shouldFollowUp).toBe(false);
  });

  it('always produces a trigger string for the session log', () => {
    const cases = [
      { current: 'mid' as const, recentScores: [90, 90], missedPoints: [] },
      { current: 'mid' as const, recentScores: [20, 20], missedPoints: [] },
      { current: 'mid' as const, recentScores: [60, 60], missedPoints: [] },
      { current: 'mid' as const, recentScores: [], missedPoints: [] },
    ];
    for (const c of cases) {
      expect(decideDifficulty(c).trigger.length).toBeGreaterThan(10);
    }
  });

  it('exposes its thresholds as a single tunable const', () => {
    expect(DIFFICULTY_THRESHOLDS.up).toBe(80);
    expect(DIFFICULTY_THRESHOLDS.down).toBe(45);
    expect(DIFFICULTY_THRESHOLDS.window).toBe(2);
  });
});
