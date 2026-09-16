import { NextResponse } from 'next/server';
import { requireInterviewer } from '@/lib/auth-guards';
import { listAllSessions } from '@/lib/db/repositories/sessions';
import { findUserById } from '@/lib/db/repositories/users';
import { countTurns } from '@/lib/db/repositories/turns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PRD §8.3 — the interviewer console defaults to ANONYMISED views.
 *
 * No name, no email, no CV content. The candidate is a stable pseudonym so
 * progress can be discussed without identifying anyone. Revealing an identity
 * is a separate, explicit, audited action.
 */
export async function GET() {
  const guard = await requireInterviewer();
  if (!guard.ok) return NextResponse.json({ error: 'Not allowed.' }, { status: guard.status });

  const sessions = await listAllSessions(200);

  const rows = await Promise.all(
    sessions.map(async (s) => {
      const user = await findUserById(s.userId.toHexString());
      return {
        id: s._id.toHexString(),
        // The ONLY identifier that crosses this boundary by default.
        pseudonym: user?.pseudonym ?? 'Candidate #????',
        role: s.roleTitle,
        level: s.level,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        durationSec: s.durationSec,
        overallScore: s.overallScore,
        subScores: s.subScores,
        turnCount: await countTurns(s._id),
        startingDifficulty: s.startingDifficulty,
        difficultyChanges: s.difficultyChanges,
      };
    }),
  );

  return NextResponse.json({ sessions: rows, anonymised: true });
}
