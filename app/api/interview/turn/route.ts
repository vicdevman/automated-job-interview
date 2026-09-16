import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { auth } from '@/auth';
import { findSessionById, recordDifficultyChange } from '@/lib/db/repositories/sessions';
import { findQuestionSetById } from '@/lib/db/repositories/questionSets';
import { insertTurn, listTurns } from '@/lib/db/repositories/turns';
import { evaluateTurn, followUpQuestion } from '@/lib/interview/orchestrator';
import { computeMetrics, turnScore } from '@/lib/interview/scoring';
import { decideDifficulty } from '@/lib/interview/difficulty';
import type { GeneratedQuestion } from '@/lib/db/models';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * PRD §6.1 step 6 — the heart of the loop.
 *
 *   deterministic metrics → LLM evaluation → difficulty policy
 *   → persist the turn → return the next question
 *
 * The turn is written to Mongo before the response is sent, so acceptance
 * criterion 10 holds: a dropped connection never loses a completed answer.
 */

const schema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  questionText: z.string().trim().min(1),
  transcript: z.string().trim().min(1, 'No answer was captured.').max(20_000),
  inputMode: z.enum(['voice', 'text']).default('voice'),
  isFollowUp: z.boolean().default(false),
  timings: z
    .object({
      questionSpokenAt: z.number().nullable().default(null),
      answerStartedAt: z.number().nullable().default(null),
      answerEndedAt: z.number().nullable().default(null),
    })
    .default({ questionSpokenAt: null, answerStartedAt: null, answerEndedAt: null }),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const interview = await findSessionById(body.sessionId);
  if (!interview) {
    return NextResponse.json({ error: 'No such interview.' }, { status: 404 });
  }
  if (interview.userId.toHexString() !== session.user.id) {
    // Not 403 — a candidate should not learn that another candidate's session id exists.
    return NextResponse.json({ error: 'No such interview.' }, { status: 404 });
  }
  if (interview.status !== 'in_progress') {
    return NextResponse.json({ error: 'That interview has already finished.' }, { status: 409 });
  }

  try {
    const existingTurns = await listTurns(interview._id);
    const index = existingTurns.length;

    const questionSet = interview.questionSetId
      ? await findQuestionSetById(interview.questionSetId.toHexString())
      : null;
    const planned: GeneratedQuestion[] = questionSet?.questions ?? [];

    const asked =
      planned.find((q) => q.id === body.questionId) ??
      ({
        id: body.questionId,
        text: body.questionText,
        competency: 'General',
        difficulty: interview.currentDifficulty,
        kind: 'behavioural',
        groundedIn: [],
        expectedPoints: [],
      } satisfies GeneratedQuestion);

    // How many main questions have been asked, ignoring follow-ups, so a
    // follow-up never shortens the interview.
    const mainAsked = existingTurns.filter((t) => !t.isFollowUp).length + (body.isFollowUp ? 0 : 1);
    const isFinalQuestion = mainAsked >= interview.plannedQuestionCount;

    // ── deterministic half ────────────────────────────────────────────────
    const speakingTimeMs =
      body.inputMode === 'text' ||
      body.timings.answerStartedAt === null ||
      body.timings.answerEndedAt === null
        ? null
        : Math.max(0, body.timings.answerEndedAt - body.timings.answerStartedAt);

    const thinkingTimeMs =
      body.timings.questionSpokenAt === null || body.timings.answerStartedAt === null
        ? null
        : Math.max(0, body.timings.answerStartedAt - body.timings.questionSpokenAt);

    const metrics = computeMetrics({
      transcript: body.transcript,
      speakingTimeMs,
      thinkingTimeMs,
    });

    // ── difficulty policy, decided before evaluation so the prompt knows
    //    whether to ask for a follow-up ──────────────────────────────────────
    const recentScores = existingTurns.map((t) => t.scores.total);
    const provisional = decideDifficulty({
      current: interview.currentDifficulty,
      recentScores,
      missedPoints: [],
    });

    // ── LLM half ──────────────────────────────────────────────────────────
    const nextPlanned = planned[mainAsked] ?? null;

    const evaluation = await evaluateTurn({
      roleTitle: interview.roleTitle,
      level: interview.currentDifficulty,
      question: {
        text: asked.text,
        competency: asked.competency,
        kind: asked.kind,
        expectedPoints: asked.expectedPoints,
      },
      transcript: body.transcript,
      inputMode: body.inputMode,
      wantFollowUp: provisional.shouldFollowUp && !isFinalQuestion,
      plannedNextQuestion: nextPlanned?.text ?? null,
      isFinalQuestion,
    });

    const total = turnScore(evaluation, metrics.paceScore);

    // ── persist immediately (PRD §12) ─────────────────────────────────────
    const stored = await insertTurn({
      sessionId: interview._id,
      index,
      questionId: asked.id,
      questionText: asked.text,
      isFollowUp: body.isFollowUp,
      difficulty: interview.currentDifficulty,
      groundedIn: asked.groundedIn,
      transcript: body.transcript,
      inputMode: body.inputMode,
      timings: {
        questionSpokenAt: body.timings.questionSpokenAt,
        answerStartedAt: body.timings.answerStartedAt,
        answerEndedAt: body.timings.answerEndedAt,
        thinkingTimeMs,
        speakingTimeMs,
      },
      metrics: {
        wordCount: metrics.wordCount,
        wpm: metrics.wpm,
        fillerCount: metrics.fillerCount,
        fillerRate: metrics.fillerRate,
      },
      modalities: {
        verbal: { coveredPoints: evaluation.coveredPoints, missedPoints: evaluation.missedPoints },
        vocal: null,
        visual: null,
      },
      scores: {
        relevance: evaluation.relevance,
        clarity: evaluation.clarity,
        structure: evaluation.structure,
        pace: metrics.paceScore ?? 0,
        total,
      },
      feedback: evaluation.feedback,
      llm: evaluation.llm,
    });

    // ── final difficulty decision, now including this turn ────────────────
    const decision = decideDifficulty({
      current: interview.currentDifficulty,
      recentScores: [...recentScores, total],
      missedPoints: evaluation.missedPoints,
    });

    if (decision.changed) {
      await recordDifficultyChange(interview._id, {
        turnIndex: index,
        from: interview.currentDifficulty,
        to: decision.next,
        trigger: decision.trigger,
      });
    }

    // ── choose the next question ──────────────────────────────────────────
    let nextQuestion: GeneratedQuestion | null = null;
    if (!isFinalQuestion) {
      nextQuestion = evaluation.followUp
        ? followUpQuestion(evaluation.followUp, decision.next, asked.groundedIn)
        : (nextPlanned ?? null);
    }

    return NextResponse.json({
      turnIndex: index,
      scores: stored.scores,
      metrics: stored.metrics,
      feedback: evaluation.feedback,
      coveredPoints: evaluation.coveredPoints,
      missedPoints: evaluation.missedPoints,
      difficulty: {
        current: decision.next,
        changed: decision.changed,
        trigger: decision.trigger,
      },
      nextQuestion,
      isFinal: nextQuestion === null,
      questionsAnswered: index + 1,
    });
  } catch (e) {
    console.error('[interview/turn] failed', e);
    return NextResponse.json({ error: 'Could not score that answer.' }, { status: 502 });
  }
}
