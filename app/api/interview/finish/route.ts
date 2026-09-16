import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { completeSession, findSessionById, markSessionStatus } from '@/lib/db/repositories/sessions';
import { listTurns } from '@/lib/db/repositories/turns';
import { summariseSession } from '@/lib/interview/orchestrator';
import { averageSubScores, sessionScore } from '@/lib/interview/scoring';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const schema = z.object({
  sessionId: z.string().min(1),
  /** True when the candidate left early rather than finishing the question set. */
  abandoned: z.boolean().default(false),
});

/** PRD §6.1 step 7 — aggregate the turns, summarise, close the session. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Which interview?' }, { status: 400 });
  }

  const interview = await findSessionById(parsed.data.sessionId);
  if (!interview || interview.userId.toHexString() !== session.user.id) {
    return NextResponse.json({ error: 'No such interview.' }, { status: 404 });
  }

  // Finishing twice is a normal consequence of a double-click or a retry, not
  // an error worth showing the candidate.
  if (interview.status === 'completed') {
    return NextResponse.json({ sessionId: parsed.data.sessionId, alreadyCompleted: true });
  }

  try {
    const turns = await listTurns(interview._id);

    if (turns.length === 0) {
      await markSessionStatus(interview._id, 'abandoned');
      return NextResponse.json({
        sessionId: parsed.data.sessionId,
        abandoned: true,
        message: 'No answers were recorded, so there is nothing to score.',
      });
    }

    const overallScore = sessionScore(turns.map((t) => t.scores.total));
    const subScores = averageSubScores(
      turns.map((t) => ({
        relevance: t.scores.relevance,
        clarity: t.scores.clarity,
        structure: t.scores.structure,
        // A typed answer stored pace 0; it must not drag the pace average down.
        pace: t.inputMode === 'text' ? null : t.scores.pace,
      })),
    );

    const summary = await summariseSession({
      roleTitle: interview.roleTitle,
      level: interview.level,
      overallScore,
      turns: turns.map((t) => ({
        index: t.index,
        question: t.questionText,
        transcript: t.transcript,
        scores: {
          relevance: t.scores.relevance,
          clarity: t.scores.clarity,
          structure: t.scores.structure,
          total: t.scores.total,
        },
        wpm: t.metrics.wpm,
        fillerCount: t.metrics.fillerCount,
      })),
    });

    const durationSec = Math.max(
      1,
      Math.round((Date.now() - interview.startedAt.getTime()) / 1000),
    );

    await completeSession(interview._id, {
      overallScore,
      subScores,
      summary: summary.summary,
      strengths: summary.strengths,
      improvements: summary.improvements,
      durationSec,
    });

    return NextResponse.json({
      sessionId: parsed.data.sessionId,
      overallScore,
      subScores,
      summary: summary.summary,
      strengths: summary.strengths,
      improvements: summary.improvements,
      turnsAnswered: turns.length,
      durationSec,
      difficultyChanges: interview.difficultyChanges,
    });
  } catch (e) {
    console.error('[interview/finish] failed', e);
    return NextResponse.json({ error: 'Could not close the interview.' }, { status: 502 });
  }
}
