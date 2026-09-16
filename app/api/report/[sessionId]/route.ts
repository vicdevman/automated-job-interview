import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { findSessionById } from '@/lib/db/repositories/sessions';
import { listTurns } from '@/lib/db/repositories/turns';
import { renderReport } from '@/lib/report/render';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** PRD §10 — PDF export of a completed interview. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const interview = await findSessionById(sessionId);
  if (!interview) {
    return NextResponse.json({ error: 'No such interview.' }, { status: 404 });
  }

  // A candidate may export their own; an interviewer may export any, which is
  // an identified action rather than an anonymised view.
  const owner = interview.userId.toHexString() === session.user.id;
  if (!owner && session.user.role !== 'interviewer') {
    return NextResponse.json({ error: 'No such interview.' }, { status: 404 });
  }

  try {
    const turns = await listTurns(new ObjectId(sessionId));
    const pdf = await renderReport({ interview, turns });

    const date = interview.startedAt.toISOString().slice(0, 10);
    const filename = `interview-${interview.roleTitle.toLowerCase().replace(/\W+/g, '-')}-${date}.pdf`;

    return new Response(pdf as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[report] failed', e);
    return NextResponse.json({ error: 'Could not build the report.' }, { status: 500 });
  }
}
