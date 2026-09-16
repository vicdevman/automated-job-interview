import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { auth, signOut } from '@/auth';
import { deleteUser } from '@/lib/db/repositories/users';
import { deleteDocumentsForUser } from '@/lib/db/repositories/documents';
import { deleteFactsForUser } from '@/lib/db/repositories/facts';
import { deleteSessionsForUser } from '@/lib/db/repositories/sessions';
import { deleteTurnsForSessions } from '@/lib/db/repositories/turns';
import { deleteQuestionSetsForUser } from '@/lib/db/repositories/questionSets';
import { recordAudit } from '@/lib/db/repositories/audit';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * PRD §8.4 and acceptance criterion 8 — hard delete, leaving no trace in any
 * collection.
 *
 * Order matters: turns are found via their sessions, so the session ids are
 * collected before the sessions are removed. Deleting sessions first would
 * orphan every turn.
 *
 * The audit entry is written BEFORE the deletion and deliberately records only
 * the fact that a deletion happened plus a hashed subject — keeping an audit
 * trail that itself contains the deleted person's identity would defeat the
 * purpose.
 */
const schema = z.object({
  confirm: z.literal('DELETE', {
    message: 'Type DELETE to confirm. This cannot be undone.',
  }),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Confirmation required.' },
      { status: 400 },
    );
  }

  const userId = new ObjectId(session.user.id);

  try {
    await recordAudit({
      actorId: null,
      action: 'privacy.delete',
      subjectId: null,
      meta: { at: new Date().toISOString(), role: session.user.role },
    });

    const sessionIds = await deleteSessionsForUser(userId);
    await deleteTurnsForSessions(sessionIds);
    await deleteFactsForUser(userId);
    await deleteDocumentsForUser(userId);
    await deleteQuestionSetsForUser(userId);
    await deleteUser(userId);

    // The JWT would otherwise keep working against a user that no longer exists.
    await signOut({ redirect: false });

    return NextResponse.json({
      deleted: true,
      sessions: sessionIds.length,
      message: 'Everything has been deleted. Nothing about you remains in the system.',
    });
  } catch (e) {
    console.error('[privacy/delete] failed', e);
    return NextResponse.json({ error: 'Could not complete the deletion.' }, { status: 500 });
  }
}
