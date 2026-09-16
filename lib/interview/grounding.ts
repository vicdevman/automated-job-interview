import type { CandidateFact, GeneratedQuestion } from '@/lib/db/models';

/**
 * PRD §1.4, §5.2, §5.5 — evidence validation.
 *
 * "Questions must be grounded in evidence, never invented." If the system asks
 * about work the candidate never did, the product is worthless and the academic
 * claim of resume-aware question generation is false.
 *
 * Two checks live here, and they are the cheapest, highest-value code in the
 * project:
 *
 *   1. verifyQuote — an extracted fact's evidence.quote must appear as a
 *      literal substring of the source text. One string comparison; it is the
 *      main defence against a hallucinated employment history.
 *
 *   2. validateQuestion — any proper noun in a generated question must appear
 *      in the evidence of a fact it claims to be grounded in, or in the role
 *      definition. This catches the model inventing "Flutterwave" while citing
 *      a real fact id.
 */

// ── 1. fact evidence ──────────────────────────────────────────────────────

/**
 * Normalises whitespace and unicode punctuation before comparing.
 *
 * PDF extraction routinely turns a single space into a newline and a hyphen
 * into an en-dash, so an exact === would discard true facts for cosmetic
 * reasons. Normalising is not the same as being lenient: the words themselves
 * must still match exactly and in order.
 */
export function normaliseForComparison(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface QuoteCheck {
  ok: boolean;
  /** Character offset of the quote in the source, or -1 when absent. */
  offset: number;
  reason?: string;
}

export function verifyQuote(quote: string, sourceText: string): QuoteCheck {
  const q = normaliseForComparison(quote);
  const s = normaliseForComparison(sourceText);

  if (q.length === 0) return { ok: false, offset: -1, reason: 'quote is empty' };
  // A three-character "quote" matches almost anything and grounds nothing.
  if (q.length < 8) return { ok: false, offset: -1, reason: 'quote is too short to be evidence' };

  const offset = s.indexOf(q);
  if (offset === -1) {
    return { ok: false, offset: -1, reason: 'quote does not appear in the source document' };
  }
  return { ok: true, offset };
}

export interface ExtractedFactCandidate {
  kind: CandidateFact['kind'];
  summary: string;
  evidence: { sourceId: string; quote: string; offset?: number };
  confidence: CandidateFact['confidence'];
}

export interface FactValidationResult {
  kept: Array<ExtractedFactCandidate & { evidence: { sourceId: string; quote: string; offset: number } }>;
  discarded: Array<{ fact: ExtractedFactCandidate; reason: string }>;
}

/**
 * PRD §5.2: "Facts failing this check are discarded, not repaired."
 * Repairing would mean asking the model to try again, which is exactly how an
 * invented fact gets laundered into a plausible one.
 */
export function validateFacts(
  candidates: ExtractedFactCandidate[],
  sourcesById: Map<string, string>,
): FactValidationResult {
  const kept: FactValidationResult['kept'] = [];
  const discarded: FactValidationResult['discarded'] = [];

  for (const fact of candidates) {
    const source = sourcesById.get(fact.evidence.sourceId);
    if (source === undefined) {
      discarded.push({ fact, reason: `unknown sourceId "${fact.evidence.sourceId}"` });
      continue;
    }

    const check = verifyQuote(fact.evidence.quote, source);
    if (!check.ok) {
      discarded.push({ fact, reason: check.reason ?? 'quote failed verification' });
      continue;
    }

    kept.push({
      ...fact,
      evidence: { sourceId: fact.evidence.sourceId, quote: fact.evidence.quote, offset: check.offset },
    });
  }

  return { kept, discarded };
}

// ── 2. question provenance ────────────────────────────────────────────────

/**
 * Words that are capitalised for grammatical reasons rather than because they
 * name something. Without this list every question starting with "Describe"
 * would be flagged.
 */
const SENTENCE_WORDS = new Set([
  'a', 'an', 'the', 'i', 'you', 'we', 'they', 'he', 'she', 'it',
  'what', 'when', 'where', 'why', 'how', 'who', 'which',
  'tell', 'describe', 'walk', 'explain', 'give', 'can', 'could', 'would',
  'have', 'has', 'had', 'do', 'does', 'did', 'is', 'are', 'was', 'were',
  'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'but', 'so', 'if',
  'your', 'my', 'our', 'their', 'this', 'that', 'these', 'those',
  'there', 'here', 'then', 'now', 'once', 'also', 'let', 'think', 'imagine',
  'suppose', 'consider', 'star', 'situation', 'task', 'action', 'result',
  'use', 'using', 'walk', 'talk', 'share', 'outline', 'summarise', 'summarize',
  'be', 'been', 'being', 'will', 'shall', 'may', 'might', 'must', 'should',
]);

/** Pulls capitalised tokens that are plausibly names of employers, products or technologies. */
export function properNouns(text: string): string[] {
  const tokens = text.match(/\b[A-Z][\w.+#-]*(?:\s+[A-Z][\w.+#-]*)*/g) ?? [];
  const found = new Set<string>();

  for (const token of tokens) {
    // Split multi-word runs so "Node JS" contributes both parts; a run that is
    // entirely sentence-words contributes nothing.
    for (const part of token.split(/\s+/)) {
      const bare = part.replace(/[.,;:!?]+$/, '');
      if (bare.length < 2) continue;
      if (SENTENCE_WORDS.has(bare.toLowerCase())) continue;
      found.add(bare);
    }
  }
  return [...found];
}

export interface QuestionValidationResult {
  ok: boolean;
  reasons: string[];
  /** Proper nouns in the question text with no support in evidence or the role. */
  unsupportedTerms: string[];
}

export interface GroundingContext {
  /** Confirmed facts, keyed by id. */
  factsById: Map<string, CandidateFact>;
  /** Role title, description and competencies, concatenated. */
  roleText: string;
  /** Optional company research text, when a company URL was supplied. */
  companyText?: string;
}

export function validateQuestion(
  question: GeneratedQuestion,
  context: GroundingContext,
): QuestionValidationResult {
  const reasons: string[] = [];

  // Every referenced fact id must exist.
  const missingIds = question.groundedIn.filter((id) => !context.factsById.has(id));
  if (missingIds.length > 0) {
    reasons.push(`references unknown fact ids: ${missingIds.join(', ')}`);
  }

  // Build the corpus a proper noun is allowed to come from.
  const allowedParts = [context.roleText, context.companyText ?? ''];
  for (const id of question.groundedIn) {
    const fact = context.factsById.get(id);
    if (fact) allowedParts.push(fact.evidence.quote, fact.summary);
  }
  const allowed = normaliseForComparison(allowedParts.join(' \n '));

  const unsupportedTerms = properNouns(question.text).filter(
    (term) => !allowed.includes(normaliseForComparison(term)),
  );

  if (unsupportedTerms.length > 0) {
    reasons.push(
      `mentions ${unsupportedTerms.map((t) => `"${t}"`).join(', ')} with no supporting evidence`,
    );
  }

  if (question.text.trim().length < 10) {
    reasons.push('question text is too short to be a real question');
  }

  return { ok: reasons.length === 0, reasons, unsupportedTerms };
}

export interface QuestionSetValidation {
  kept: GeneratedQuestion[];
  rejected: Array<{ question: GeneratedQuestion; reasons: string[] }>;
}

export function validateQuestions(
  questions: GeneratedQuestion[],
  context: GroundingContext,
): QuestionSetValidation {
  const kept: GeneratedQuestion[] = [];
  const rejected: QuestionSetValidation['rejected'] = [];

  for (const question of questions) {
    const result = validateQuestion(question, context);
    if (result.ok) kept.push(question);
    else rejected.push({ question, reasons: result.reasons });
  }

  return { kept, rejected };
}
