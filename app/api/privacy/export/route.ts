import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { findUserById } from '@/lib/db/repositories/users';
import { listDocuments } from '@/lib/db/repositories/documents';
import { listFacts } from '@/lib/db/repositories/facts';
import { listSessionsForUser } from '@/lib/db/repositories/sessions';
import { listTurns } from '@/lib/db/repositories/turns';
import { recordAudit } from '@/lib/db/repositories/audit';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * PRD §8.4 — right of access. Returns everything held about the candidate as
 * JSON, decrypted, because the point is that they can actually read it.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const userId = new ObjectId(session.user.id);

  try {
    const [user, documents, facts, sessions] = await Promise.all([
      findUserById(session.user.id),
      listDocuments(userId),
      listFacts(userId),
      listSessionsForUser(userId, 500),
    ]);

    const interviews = await Promise.all(
      sessions.map(async (s) => ({
        id: s._id.toHexString(),
        role: s.roleTitle,
        level: s.level,
        status: s.status,
        consent: s.consent,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        durationSec: s.durationSec,
        overallScore: s.overallScore,
        subScores: s.subScores,
        summary: s.summary,
        strengths: s.strengths,
        improvements: s.improvements,
        difficultyChanges: s.difficultyChanges,
        turns: (await listTurns(s._id)).map((t) => ({
          index: t.index,
          question: t.questionText,
          answer: t.transcript,
          inputMode: t.inputMode,
          metrics: t.metrics,
          scores: t.scores,
          feedback: t.feedback,
          evaluatedBy: t.llm,
          answeredAt: t.createdAt,
        })),
      })),
    );

    await recordAudit({ actorId: userId, action: 'privacy.export', subjectId: session.user.id });

    const payload = {
      exportedAt: new Date().toISOString(),
      note:
        'This is everything this system holds about you. Audio was never recorded — only these transcripts exist.',
      account: user
        ? { email: user.email, name: user.name, role: user.role, createdAt: user.createdAt }
        : null,
      documents: documents.map((d) => ({
        id: d.id,
        kind: d.kind,
        filename: d.filename ?? null,
        url: d.url ?? null,
        text: d.rawText,
        addedAt: d.createdAt,
      })),
      extractedFacts: facts,
      interviews,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="my-interview-data-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[privacy/export] failed', e);
    return NextResponse.json({ error: 'Could not build your export.' }, { status: 500 });
  }
}
