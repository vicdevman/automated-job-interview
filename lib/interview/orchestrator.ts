import 'server-only';
import { llm } from '@/lib/providers/registry';
import {
  evaluateTurnPrompt,
  generateQuestionsPrompt,
  summariseSessionPrompt,
  withQuestionIds,
  EVALUATE_TURN_SCHEMA,
  GENERATE_QUESTIONS_SCHEMA,
  SUMMARISE_SESSION_SCHEMA,
  type EvaluateTurnContext,
  type EvaluateTurnResponse,
  type GenerateQuestionsResponse,
  type QuestionGenerationContext,
  type SummariseSessionContext,
  type SummariseSessionResponse,
} from './prompts';
import { validateQuestions, type GroundingContext } from './grounding';
import { clamp } from './scoring';
import type { GeneratedQuestion, Level } from '@/lib/db/models';

/**
 * PRD §5.5, §7 — the server-side turn machine.
 *
 * Everything that needs the LLM plus validation lives here, so route handlers
 * stay thin and the provider rule (no vendor imports outside lib/providers)
 * holds trivially.
 */

export interface QuestionSetResult {
  questions: GeneratedQuestion[];
  rejected: Array<{ text: string; reasons: string[] }>;
  provider: { provider: string; model: string };
  /** True when we could not reach the requested count even after a top-up. */
  short: boolean;
}

/**
 * Generates a validated question set.
 *
 * Two behaviours the PRD demands and one the live model forced:
 *   - questions failing provenance validation are regenerated once, then
 *     dropped (PRD §5.5);
 *   - observed in testing: asked for 6 questions the model reliably returns 3
 *     to 5. Rather than letting an interview silently run short, a top-up call
 *     requests the shortfall.
 */
export async function generateQuestionSet(
  ctx: QuestionGenerationContext,
  grounding: GroundingContext,
): Promise<QuestionSetResult> {
  const provider = llm();
  const providerInfo = { provider: provider.id, model: provider.defaultModel };

  const kept: GeneratedQuestion[] = [];
  const rejected: QuestionSetResult['rejected'] = [];
  const seen = new Set<string>();

  // Up to three passes: initial, one regeneration for rejects, one top-up.
  for (let pass = 0; pass < 3 && kept.length < ctx.count; pass++) {
    const shortfall = ctx.count - kept.length;

    const response = await provider.complete<GenerateQuestionsResponse>({
      ...generateQuestionsPrompt({
        ...ctx,
        // Ask for a couple extra so validation rejects do not leave us short.
        count: pass === 0 ? ctx.count : Math.min(shortfall + 2, 10),
      }),
      jsonSchema: GENERATE_QUESTIONS_SCHEMA,
      temperature: pass === 0 ? 0.5 : 0.7,
      // Six questions with expected points is the largest document this app
      // asks any model to produce.
      maxTokens: 12_000,
    });

    const validated = validateQuestions(withQuestionIds(response.questions ?? []), grounding);

    for (const question of validated.kept) {
      if (isNearDuplicate(question, kept, seen)) continue;
      seen.add(fingerprint(question.text));
      kept.push(question);
      if (kept.length >= ctx.count) break;
    }

    for (const r of validated.rejected) {
      rejected.push({ text: r.question.text, reasons: r.reasons });
    }
  }

  return {
    questions: kept.slice(0, ctx.count),
    rejected,
    provider: providerInfo,
    short: kept.length < ctx.count,
  };
}

export interface TurnEvaluation {
  relevance: number;
  clarity: number;
  structure: number;
  feedback: string;
  /** Short spoken bridge, said aloud before whatever comes next. */
  transition: string;
  coveredPoints: string[];
  missedPoints: string[];
  followUp: { text: string; competency: string } | null;
  llm: { provider: string; model: string; latencyMs: number };
}

export async function evaluateTurn(ctx: EvaluateTurnContext): Promise<TurnEvaluation> {
  const provider = llm();
  const startedAt = Date.now();

  const raw = await provider.complete<EvaluateTurnResponse>({
    ...evaluateTurnPrompt(ctx),
    jsonSchema: EVALUATE_TURN_SCHEMA,
    temperature: 0.2,
    maxTokens: 6_000,
  });

  const latencyMs = Date.now() - startedAt;

  // The model is not trusted to stay in range, and a 150 would inflate the
  // session average silently.
  const relevance = clamp(Number(raw.relevance) || 0, 0, 100);
  const clarity = clamp(Number(raw.clarity) || 0, 0, 100);
  const structure = clamp(Number(raw.structure) || 0, 0, 100);

  const followUpText = raw.nextQuestion?.text?.trim();
  const followUp =
    ctx.wantFollowUp && !ctx.isFinalQuestion && followUpText && followUpText.length >= 10
      ? {
          text: followUpText,
          competency: raw.nextQuestion?.competency?.trim() || ctx.question.competency,
        }
      : null;

  return {
    relevance,
    clarity,
    structure,
    feedback: String(raw.feedback ?? '').trim(),
    transition: String(raw.transition ?? '').trim() || 'Okay, thank you.',
    coveredPoints: asStringArray(raw.coveredPoints),
    missedPoints: asStringArray(raw.missedPoints),
    followUp,
    llm: { provider: provider.id, model: provider.defaultModel, latencyMs },
  };
}

export async function summariseSession(
  ctx: SummariseSessionContext,
): Promise<SummariseSessionResponse> {
  const provider = llm();

  const raw = await provider.complete<SummariseSessionResponse>({
    ...summariseSessionPrompt(ctx),
    jsonSchema: SUMMARISE_SESSION_SCHEMA,
    temperature: 0.4,
    maxTokens: 6_000,
  });

  return {
    summary: String(raw.summary ?? '').trim(),
    strengths: asStringArray(raw.strengths).slice(0, 4),
    improvements: asStringArray(raw.improvements).slice(0, 4),
  };
}

/**
 * Builds the follow-up as a GeneratedQuestion so the rest of the pipeline does
 * not need a special case for it.
 */
export function followUpQuestion(
  followUp: { text: string; competency: string },
  difficulty: Level,
  groundedIn: string[],
): GeneratedQuestion {
  return {
    id: `fu-${Math.random().toString(36).slice(2, 10)}`,
    text: followUp.text,
    competency: followUp.competency,
    difficulty,
    kind: 'behavioural',
    groundedIn,
    expectedPoints: [],
  };
}

/**
 * Content words of a question, for duplicate detection. Observed in testing:
 * the model happily produces "how you collaborated with other engineers at
 * Paystack" and "how you worked with other engineers on the migration at
 * Paystack" in the same set. Exact-text matching does not catch that, and two
 * near-identical questions waste a sixth of the interview.
 */
const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','of','to','in','on','at','for','with','from','by','as',
  'you','your','me','my','we','our','they','their','it','its','this','that','these','those',
  'can','could','would','should','will','did','do','does','was','were','is','are','be','been',
  'about','tell','describe','walk','explain','give','share','what','when','where','why','how',
  'time','us','any','more','most','some','there','then','than','into','over','during','while',
]);

function contentWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

function fingerprint(text: string): string {
  return [...contentWords(text)].sort().join(' ');
}

/**
 * Duplicate detection by OVERLAP COEFFICIENT — shared content words divided by
 * the SMALLER of the two word sets.
 *
 * Jaccard (shared / union) was tried first and let this pair through:
 *   "What was your role in creating internal tooling for the talent matching
 *    team, and how did you ensure it met the team's needs?"
 *   "Tell me about a time you built internal tooling for the talent matching
 *    team and how you worked with other engineers to deliver it?"
 * They share every distinctive word — internal, tooling, talent, matching,
 * team — but the longer question's extra filler inflates the union and drags
 * the ratio to 0.28. Dividing by the smaller set gives 0.5 and catches it,
 * because what matters is whether one question is substantially contained in
 * the other, not how verbose either happens to be.
 */
function isNearDuplicate(
  question: GeneratedQuestion,
  kept: GeneratedQuestion[],
  seen: Set<string>,
): boolean {
  if (seen.has(fingerprint(question.text))) return true;

  const words = contentWords(question.text);
  if (words.size === 0) return false;

  for (const existing of kept) {
    const other = contentWords(existing.text);
    if (other.size === 0) continue;

    let shared = 0;
    for (const w of words) if (other.has(w)) shared++;

    const containment = shared / Math.min(words.size, other.size);
    if (containment >= 0.5) return true;

    // Same competency needs less overlap to count as asking the same thing.
    if (existing.competency === question.competency && containment >= 0.4) return true;
  }
  return false;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

/** Exposed for unit tests only — not part of the module's API. */
export const __testing = { isNearDuplicate, contentWords, fingerprint };
