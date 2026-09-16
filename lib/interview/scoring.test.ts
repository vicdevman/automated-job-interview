import { describe, it, expect } from 'vitest';
import {
  analyseFillers,
  averageSubScores,
  computeMetrics,
  countWords,
  PACE_BAND,
  paceScore,
  sessionScore,
  turnScore,
  wordsPerMinute,
} from './scoring';

describe('countWords', () => {
  it('counts plain words', () => {
    expect(countWords('I fixed the bug')).toBe(4);
  });

  it('ignores punctuation', () => {
    expect(countWords('Well, I fixed it — eventually!')).toBe(5);
  });

  it('treats hyphenated and apostrophised words as one', () => {
    expect(countWords("It's a well-known trade-off")).toBe(4);
  });

  it('counts numbers', () => {
    expect(countWords('We cut latency by 40 percent')).toBe(6);
  });

  it('returns 0 for empty or whitespace input', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n  ')).toBe(0);
  });
});

describe('wordsPerMinute', () => {
  it('computes a rate', () => {
    // 140 words in 60s = 140 wpm
    expect(wordsPerMinute(140, 60_000)).toBeCloseTo(140, 5);
  });

  it('refuses to extrapolate from sub-second audio', () => {
    // One word in 200ms is 300wpm extrapolated — meaningless, and it would
    // poison the session average.
    expect(wordsPerMinute(1, 200)).toBeNull();
  });

  it('returns null when nothing was said', () => {
    expect(wordsPerMinute(0, 30_000)).toBeNull();
  });
});

describe('paceScore (PRD §7.1 — band 120–160 WPM)', () => {
  it('scores 100 inside the band, including at both edges', () => {
    expect(paceScore(PACE_BAND.min)).toBe(100);
    expect(paceScore(140)).toBe(100);
    expect(paceScore(PACE_BAND.max)).toBe(100);
  });

  it('falls off linearly below the band', () => {
    expect(paceScore(100)).toBe(75); // 20 wpm under → 25% penalty
    expect(paceScore(80)).toBe(50);
  });

  it('falls off linearly above the band', () => {
    expect(paceScore(180)).toBe(75);
    expect(paceScore(200)).toBe(50);
  });

  it('floors at 0 rather than going negative', () => {
    expect(paceScore(10)).toBe(0);
    expect(paceScore(400)).toBe(0);
  });

  it('passes null through for typed answers', () => {
    expect(paceScore(null)).toBeNull();
  });
});

describe('analyseFillers', () => {
  it('counts the obvious ones', () => {
    const r = analyseFillers('Um, so uh basically I actually fixed it');
    expect(r.byPhrase['um']).toBe(1);
    expect(r.byPhrase['uh']).toBe(1);
    expect(r.byPhrase['basically']).toBe(1);
    expect(r.byPhrase['actually']).toBe(1);
    expect(r.fillerCount).toBe(4);
  });

  it('counts multi-word fillers', () => {
    const r = analyseFillers('It was, you know, sort of a mess');
    expect(r.byPhrase['you know']).toBe(1);
    expect(r.byPhrase['sort of']).toBe(1);
  });

  it('does not count "like" when it is a real verb', () => {
    expect(analyseFillers('I like Python').fillerCount).toBe(0);
    expect(analyseFillers('We like that approach').fillerCount).toBe(0);
  });

  it('does not count "like" introducing a comparison', () => {
    expect(analyseFillers('something like that').fillerCount).toBe(0);
    expect(analyseFillers('it was like a queue').fillerCount).toBe(0);
  });

  it('does count "like" used as a filler', () => {
    expect(analyseFillers('it was, like, really hard').fillerCount).toBeGreaterThan(0);
  });

  it('matches on word boundaries, not substrings', () => {
    // "um" must not fire inside "umbrella"; "uh" must not fire inside "uhuru".
    expect(analyseFillers('The umbrella was there').fillerCount).toBe(0);
  });

  it('computes a rate against word count', () => {
    const r = analyseFillers('um um um one two three four five six seven');
    expect(r.fillerCount).toBe(3);
    expect(r.fillerRate).toBeCloseTo(3 / 10, 5);
  });

  it('returns a zero rate for an empty transcript', () => {
    const r = analyseFillers('');
    expect(r.fillerCount).toBe(0);
    expect(r.fillerRate).toBe(0);
  });
});

describe('computeMetrics', () => {
  it('produces a full metric set for a spoken answer', () => {
    const transcript =
      'Um, I once had a production issue where the database connections were exhausted, ' +
      'so I checked the pool metrics and found a leak in the retry path.';
    const m = computeMetrics({ transcript, speakingTimeMs: 12_000, thinkingTimeMs: 1_500 });

    expect(m.wordCount).toBe(countWords(transcript));
    expect(m.wpm).toBeGreaterThan(0);
    expect(m.fillerCount).toBe(1);
    expect(m.paceScore).not.toBeNull();
    expect(m.thinkingTimeMs).toBe(1_500);
  });

  it('omits pace for a typed answer (PRD §6.5)', () => {
    const m = computeMetrics({
      transcript: 'I debugged it by reading the logs.',
      speakingTimeMs: null,
      thinkingTimeMs: null,
    });
    expect(m.wpm).toBeNull();
    expect(m.paceScore).toBeNull();
    expect(m.wordCount).toBe(7);
  });
});

describe('turnScore (PRD §7.4 weights)', () => {
  it('applies the documented weights', () => {
    // 0.40*80 + 0.25*70 + 0.20*60 + 0.15*100 = 32 + 17.5 + 12 + 15 = 76.5
    expect(turnScore({ relevance: 80, clarity: 70, structure: 60 }, 100)).toBe(76.5);
  });

  it('returns 100 for a perfect answer', () => {
    expect(turnScore({ relevance: 100, clarity: 100, structure: 100 }, 100)).toBe(100);
  });

  it('returns 0 for a total miss', () => {
    expect(turnScore({ relevance: 0, clarity: 0, structure: 0 }, 0)).toBe(0);
  });

  it('redistributes pace weight for typed answers instead of scoring pace 0', () => {
    // Without redistribution a perfect typed answer would cap at 85.
    expect(turnScore({ relevance: 100, clarity: 100, structure: 100 }, null)).toBe(100);
  });

  it('clamps out-of-range model output', () => {
    // An LLM returning 150 must not inflate the score past 100.
    expect(turnScore({ relevance: 150, clarity: 100, structure: 100 }, 100)).toBe(100);
    expect(turnScore({ relevance: -50, clarity: 0, structure: 0 }, 0)).toBe(0);
  });
});

describe('sessionScore', () => {
  it('averages turn scores', () => {
    expect(sessionScore([80, 90, 70])).toBe(80);
  });

  it('returns 0 for a session with no turns', () => {
    expect(sessionScore([])).toBe(0);
  });
});

describe('averageSubScores', () => {
  it('averages each dimension independently', () => {
    const result = averageSubScores([
      { relevance: 80, clarity: 70, structure: 60, pace: 100 },
      { relevance: 60, clarity: 90, structure: 80, pace: 50 },
    ]);
    expect(result).toEqual({ relevance: 70, clarity: 80, structure: 70, pace: 75 });
  });

  it('ignores null pace rather than averaging it as zero', () => {
    const result = averageSubScores([
      { relevance: 80, clarity: 80, structure: 80, pace: 100 },
      { relevance: 80, clarity: 80, structure: 80, pace: null },
    ]);
    expect(result.pace).toBe(100);
  });

  it('handles an all-typed session', () => {
    const result = averageSubScores([{ relevance: 80, clarity: 80, structure: 80, pace: null }]);
    expect(result.pace).toBe(0);
  });
});
