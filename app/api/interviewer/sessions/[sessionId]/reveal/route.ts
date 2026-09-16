import { NextResponse } from 'next/server';
import { requireInterviewer } from '@/lib/auth-guards';
import { findSessionById } from '@/lib/db/repositories/sessions';
import { findUserById } from '@/lib/db/repositories/users';
import { recordAudit } from '@/lib/db/repositories/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PRD §8.3 — "Revealing identity is an explicit per-session action that writes
 * an audit log entry."
 *
 * POST rather than GET on purpose: this has a side effect (the audit entry),
 * and a GET could be triggered by a prefetch or a crawler, producing audit
 * entries nobody intended.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const guard = await requireInterviewer();
  if (!guard.ok) return NextResponse.json({ error: 'Not allowed.' }, { status: guard.status });

  const { sessionId } = await params;
  const interview = await findSessionById(sessionId);
  if (!interview) return NextResponse.json({ error: 'No such session.' }, { status: 404 });

  const user = await findUserById(interview.userId.toHexString());
  if (!user) return NextResponse.json({ error: 'That candidate no longer exists.' }, { status: 404 });

  await recordAudit({
    actorId: guard.userId,
    action: 'session.reveal_identity',
    subjectId: sessionId,
    meta: { revealedBy: guard.email, pseudonym: user.pseudonym },
  });

  return NextResponse.json({
    name: user.name,
    email: user.email,
    pseudonym: user.pseudonym,
    revealedAt: new Date().toISOString(),
    notice: 'This reveal has been recorded in the audit log.',
  });
}
