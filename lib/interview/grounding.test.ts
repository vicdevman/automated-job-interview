import { describe, it, expect } from 'vitest';
import {
  properNouns,
  validateFacts,
  validateQuestion,
  validateQuestions,
  verifyQuote,
  type ExtractedFactCandidate,
  type GroundingContext,
} from './grounding';
import type { CandidateFact, GeneratedQuestion } from '@/lib/db/models';

/**
 * Evidence for acceptance criterion 2 (PRD §15): "Every personalised question's
 * provenance resolves to a verbatim span in a source document."
 */

const CV = `
Ada Lovelace
Software Engineer

Paystack — Backend Engineer (2021 to 2023)
Led the migration of the settlements service from a monolith to three
services, cutting end-of-day reconciliation time from four hours to twenty
minutes. Worked primarily in Python and PostgreSQL.

Andela — Junior Developer (2019 to 2021)
Built internal tooling in Node.js for the talent matching team.
`;

describe('verifyQuote (PRD §5.2)', () => {
  it('accepts a verbatim span', () => {
    const r = verifyQuote('Led the migration of the settlements service', CV);
    expect(r.ok).toBe(true);
    expect(r.offset).toBeGreaterThan(-1);
  });

  it('accepts a span the PDF extractor rewrapped across lines', () => {
    // The CV has a newline between "three" and "services".
    const r = verifyQuote('from a monolith to three services', CV);
    expect(r.ok).toBe(true);
  });

  it('tolerates smart quotes and en-dashes from PDF extraction', () => {
    const source = 'Worked on the payments team — shipped the “fast path” release.';
    expect(verifyQuote('shipped the "fast path" release', source).ok).toBe(true);
  });

  it('REJECTS an invented employer', () => {
    // The whole point of the check.
    const r = verifyQuote('Led the payments migration at Flutterwave', CV);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('does not appear');
  });

  it('rejects a paraphrase that changes the words', () => {
    expect(verifyQuote('Managed the settlement service migration', CV).ok).toBe(false);
  });

  it('rejects an empty quote', () => {
    expect(verifyQuote('', CV).ok).toBe(false);
  });

  it('rejects a quote too short to ground anything', () => {
    const r = verifyQuote('the', CV);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('too short');
  });

  it('is case-insensitive', () => {
    expect(verifyQuote('LED THE MIGRATION OF THE SETTLEMENTS SERVICE', CV).ok).toBe(true);
  });
});

describe('validateFacts', () => {
  const sources = new Map([['cv1', CV]]);

  const realFact: ExtractedFactCandidate = {
    kind: 'employment',
    summary: 'Migrated the settlements service at Paystack',
    evidence: { sourceId: 'cv1', quote: 'Led the migration of the settlements service' },
    confidence: 'high',
  };

  const inventedFact: ExtractedFactCandidate = {
    kind: 'employment',
    summary: 'Led payments at Flutterwave',
    evidence: { sourceId: 'cv1', quote: 'Led the payments platform at Flutterwave' },
    confidence: 'high',
  };

  it('keeps facts whose quotes verify, and records the offset', () => {
    const r = validateFacts([realFact], sources);
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0]!.evidence.offset).toBeGreaterThan(-1);
    expect(r.discarded).toHaveLength(0);
  });

  it('discards hallucinated facts rather than repairing them', () => {
    const r = validateFacts([realFact, inventedFact], sources);
    expect(r.kept).toHaveLength(1);
    expect(r.discarded).toHaveLength(1);
    expect(r.discarded[0]!.fact.summary).toContain('Flutterwave');
  });

  it('discards a fact citing a source that does not exist', () => {
    const r = validateFacts(
      [{ ...realFact, evidence: { ...realFact.evidence, sourceId: 'nope' } }],
      sources,
    );
    expect(r.kept).toHaveLength(0);
    expect(r.discarded[0]!.reason).toContain('unknown sourceId');
  });

  it('handles an empty input', () => {
    expect(validateFacts([], sources).kept).toHaveLength(0);
  });
});

describe('properNouns', () => {
  it('finds employers and technologies', () => {
    const found = properNouns('Tell me about your work with PostgreSQL at Paystack.');
    expect(found).toContain('PostgreSQL');
    expect(found).toContain('Paystack');
  });

  it('ignores sentence-initial ordinary words', () => {
    expect(properNouns('Describe a time you shipped something.')).toHaveLength(0);
    expect(properNouns('What was the hardest part?')).toHaveLength(0);
  });

  it('ignores the STAR acronym used as method vocabulary', () => {
    expect(properNouns('Use the STAR structure: Situation, Task, Action, Result.')).toHaveLength(0);
  });
});

describe('validateQuestion (PRD §5.5)', () => {
  const fact: CandidateFact = {
    id: 'f1',
    kind: 'employment',
    summary: 'Migrated the settlements service at Paystack',
    evidence: {
      sourceId: 'cv1',
      quote: 'Paystack — Backend Engineer (2021 to 2023) Led the migration of the settlements service',
      offset: 0,
    },
    confidence: 'high',
    confirmedByUser: true,
  };

  const context: GroundingContext = {
    factsById: new Map([['f1', fact]]),
    roleText: 'Software Engineer. Designs and builds production software. Competencies: system design, debugging.',
  };

  const base: GeneratedQuestion = {
    id: 'q1',
    text: '',
    competency: 'System design',
    difficulty: 'mid',
    kind: 'behavioural',
    groundedIn: ['f1'],
    expectedPoints: ['why the split was needed'],
  };

  it('accepts a question grounded in a real fact', () => {
    const q = {
      ...base,
      text: 'You led the migration of the settlements service at Paystack. What forced that decision?',
    };
    expect(validateQuestion(q, context).ok).toBe(true);
  });

  it('REJECTS a question naming an employer the candidate never worked for', () => {
    const q = {
      ...base,
      text: 'Tell me about your work migrating the payments service at Flutterwave.',
    };
    const r = validateQuestion(q, context);
    expect(r.ok).toBe(false);
    expect(r.unsupportedTerms).toContain('Flutterwave');
  });

  it('rejects a question citing a fact id that does not exist', () => {
    const q = { ...base, text: 'Describe a hard technical decision you made.', groundedIn: ['ghost'] };
    const r = validateQuestion(q, context);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toContain('unknown fact ids');
  });

  it('allows a generic question with no grounding at all', () => {
    // PRD §5.5: "empty means generic, which is allowed".
    const q = { ...base, text: 'Describe a time you disagreed with a teammate.', groundedIn: [] };
    expect(validateQuestion(q, context).ok).toBe(true);
  });

  it('allows terms that come from the role definition rather than the CV', () => {
    const q = { ...base, text: 'How do you approach system design for a new service?', groundedIn: [] };
    expect(validateQuestion(q, context).ok).toBe(true);
  });

  it('rejects a question too short to be real', () => {
    expect(validateQuestion({ ...base, text: 'Why?', groundedIn: [] }, context).ok).toBe(false);
  });
});

describe('validateQuestions', () => {
  it('partitions a set into kept and rejected', () => {
    const context: GroundingContext = { factsById: new Map(), roleText: 'Data Analyst. SQL and reporting.' };
    const questions: GeneratedQuestion[] = [
      {
        id: 'a',
        text: 'Walk me through how you would investigate a sudden drop in weekly active users.',
        competency: 'Analysis',
        difficulty: 'mid',
        kind: 'situational',
        groundedIn: [],
        expectedPoints: [],
      },
      {
        id: 'b',
        text: 'Tell me about the dashboard you built at Konga.',
        competency: 'Analysis',
        difficulty: 'mid',
        kind: 'behavioural',
        groundedIn: [],
        expectedPoints: [],
      },
    ];

    const result = validateQuestions(questions, context);
    expect(result.kept.map((q) => q.id)).toEqual(['a']);
    expect(result.rejected.map((r) => r.question.id)).toEqual(['b']);
  });
});
