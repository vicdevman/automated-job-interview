import { describe, it, expect } from 'vitest';
import { __testing } from './orchestrator';
import type { GeneratedQuestion } from '@/lib/db/models';

const { isNearDuplicate } = __testing;

function q(text: string, competency = 'General'): GeneratedQuestion {
  return {
    id: Math.random().toString(36).slice(2),
    text,
    competency,
    difficulty: 'mid',
    kind: 'behavioural',
    groundedIn: [],
    expectedPoints: [],
  };
}

/**
 * Regression tests for pairs the live model actually produced in one question
 * set. Both slipped past an earlier Jaccard-based check.
 */
describe('near-duplicate question detection', () => {
  it('catches the internal-tooling pair that Jaccard missed', () => {
    const first = q(
      'What was your role in creating internal tooling for the talent matching team, and how did you ensure it met the team’s needs and integrated smoothly?',
    );
    const second = q(
      'Can you tell me about a time you built internal tooling for the talent matching team and how you worked with other engineers to deliver it?',
    );
    expect(isNearDuplicate(second, [first], new Set())).toBe(true);
  });

  it('catches the collaboration pair', () => {
    const first = q(
      'Can you tell us about your role as a Backend Engineer at Paystack and how you collaborated with other engineers on key projects?',
      'Collaboration',
    );
    const second = q(
      'Can you tell me about a time you worked with other engineers at Paystack and how you ensured smooth collaboration?',
      'Collaboration',
    );
    expect(isNearDuplicate(second, [first], new Set())).toBe(true);
  });

  it('catches an exact repeat', () => {
    const text = 'Describe a time you disagreed with a teammate about a technical decision.';
    expect(isNearDuplicate(q(text), [q(text)], new Set())).toBe(true);
  });

  it('does NOT reject genuinely different questions about the same job', () => {
    const kept = [
      q('What steps did you take to cut the end-of-day reconciliation from four hours to twenty minutes?', 'Problem solving'),
      q('Describe the design decisions you made when migrating the settlements service from a monolith to three separate services.', 'System design'),
    ];
    const fresh = q(
      'How did you approach building the first integration test suite for the codebase, and what impact did it have on code quality?',
      'Code quality',
    );
    expect(isNearDuplicate(fresh, kept, new Set())).toBe(false);
  });

  it('does not reject two questions that merely share filler words', () => {
    const first = q('Tell me about a time you had to make a decision without enough information.');
    const second = q('Tell me about a time you had to give difficult feedback to a colleague.');
    expect(isNearDuplicate(second, [first], new Set())).toBe(false);
  });

  it('allows the first question into an empty set', () => {
    expect(isNearDuplicate(q('Anything at all about your work history?'), [], new Set())).toBe(false);
  });
});
