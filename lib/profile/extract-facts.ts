import 'server-only';
import { llm } from '@/lib/providers/registry';
import { extractFactsPrompt, EXTRACT_FACTS_SCHEMA, type ExtractFactsResponse } from '@/lib/interview/prompts';
import { validateFacts, type ExtractedFactCandidate } from '@/lib/interview/grounding';
import type { CandidateFact } from '@/lib/db/models';

/**
 * PRD §5.2 — raw document text to verified structured facts.
 *
 * The LLM proposes; `validateFacts` disposes. Anything whose quote is not a
 * literal span of the source is discarded, not repaired — that one rule is what
 * makes "resume-aware question generation" a true claim rather than a
 * plausible-sounding one.
 */

export interface FactExtractionOutcome {
  /** Verified facts, ready to persist. Not yet confirmed by the candidate. */
  facts: Array<Omit<CandidateFact, 'id' | 'confirmedByUser'>>;
  /** Kept for the interviewer console and for honest reporting to the candidate. */
  discarded: Array<{ summary: string; reason: string }>;
  stats: { proposed: number; verified: number; discarded: number };
}

export async function extractFactsFromDocument(input: {
  sourceId: string;
  documentText: string;
  documentLabel: string;
}): Promise<FactExtractionOutcome> {
  const provider = llm();

  const response = await provider.complete<ExtractFactsResponse>({
    ...extractFactsPrompt(input.documentText, input.documentLabel),
    jsonSchema: EXTRACT_FACTS_SCHEMA,
    // Low temperature: this is a copying task, not a creative one. Every point
    // of creativity here is a point of hallucination risk.
    temperature: 0.1,
    maxTokens: 12_000,
  });

  const proposed: ExtractedFactCandidate[] = (response.facts ?? []).map((f) => ({
    kind: f.kind,
    summary: String(f.summary ?? '').trim(),
    evidence: { sourceId: input.sourceId, quote: String(f.quote ?? '') },
    confidence: f.confidence ?? 'medium',
  }));

  const { kept, discarded } = validateFacts(
    proposed,
    new Map([[input.sourceId, input.documentText]]),
  );

  return {
    facts: kept.map((f) => ({
      kind: f.kind,
      summary: f.summary,
      evidence: f.evidence,
      confidence: f.confidence,
    })),
    discarded: discarded.map((d) => ({ summary: d.fact.summary, reason: d.reason })),
    stats: { proposed: proposed.length, verified: kept.length, discarded: discarded.length },
  };
}
