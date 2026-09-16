import { describe, it, expect } from 'vitest';

/**
 * PRD §8.4 — the retention boundary.
 *
 * The purge itself needs a database, so it is exercised end to end by
 * `npm run smoke:privacy`. What is worth unit-testing is the boundary
 * arithmetic, which is exactly the kind of thing that silently becomes
 * off-by-one-day and either keeps data too long (a compliance failure) or
 * deletes it too early (a user-visible bug).
 */

const DAY = 24 * 60 * 60 * 1000;

function cutoffFor(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY);
}

function isExpired(startedAt: Date, now: Date, retentionDays: number): boolean {
  return startedAt < cutoffFor(now, retentionDays);
}

describe('retention boundary', () => {
  const now = new Date('2026-09-16T12:00:00Z');

  it('keeps a session from today', () => {
    expect(isExpired(now, now, 90)).toBe(false);
  });

  it('keeps a session one day inside the window', () => {
    const at = new Date(now.getTime() - 89 * DAY);
    expect(isExpired(at, now, 90)).toBe(false);
  });

  it('keeps a session exactly on the boundary', () => {
    // Exactly 90 days old is the last day it is kept — the comparison is
    // strictly-less-than, so equality survives.
    const at = cutoffFor(now, 90);
    expect(isExpired(at, now, 90)).toBe(false);
  });

  it('purges a session one second past the boundary', () => {
    const at = new Date(cutoffFor(now, 90).getTime() - 1000);
    expect(isExpired(at, now, 90)).toBe(true);
  });

  it('purges a clearly old session', () => {
    const at = new Date(now.getTime() - 365 * DAY);
    expect(isExpired(at, now, 90)).toBe(true);
  });

  it('honours a shorter configured retention', () => {
    const at = new Date(now.getTime() - 40 * DAY);
    expect(isExpired(at, now, 90)).toBe(false);
    expect(isExpired(at, now, 30)).toBe(true);
  });

  it('computes the cutoff 90 days back, not 90 months or 90 hours', () => {
    const cutoff = cutoffFor(now, 90);
    const daysBack = Math.round((now.getTime() - cutoff.getTime()) / DAY);
    expect(daysBack).toBe(90);
    expect(cutoff.toISOString().slice(0, 10)).toBe('2026-06-18');
  });
});
