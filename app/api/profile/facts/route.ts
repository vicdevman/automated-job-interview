import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { auth } from '@/auth';
import { confirmFacts, deleteFact, listFacts, updateFact } from '@/lib/db/repositories/facts';
import { recordAudit } from '@/lib/db/repositories/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PRD §5.3 — the candidate review step: list, edit, delete, confirm. */

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const facts = await listFacts(new ObjectId(session.user.id));
  return NextResponse.json({ facts });
}

const patchSchema = z.object({
  id: z.string().min(1),
  summary: z.string().trim().min(3).max(500).optional(),
  kind: z.enum(['employment', 'project', 'education', 'skill', 'achievement', 'gap']).optional(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  }

  const { id, ...patch } = parsed.data;
  const fact = await updateFact(new ObjectId(session.user.id), id, patch);
  if (!fact) return NextResponse.json({ error: 'No such fact.' }, { status: 404 });
  return NextResponse.json({ fact });
}

const confirmSchema = z.object({ ids: z.array(z.string().min(1)).min(1) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Send the fact ids to confirm.' }, { status: 400 });
  }

  const userId = new ObjectId(session.user.id);
  const confirmed = await confirmFacts(userId, parsed.data.ids);

  // PRD §5.3: "Log the confirmation." It is the record that the candidate
  // affirmatively approved what the system believes about them.
  await recordAudit({
    actorId: userId,
    action: 'facts.confirm',
    subjectId: session.user.id,
    meta: { count: confirmed },
  });

  return NextResponse.json({ confirmed });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which fact?' }, { status: 400 });

  const ok = await deleteFact(new ObjectId(session.user.id), id);
  return NextResponse.json({ deleted: ok }, { status: ok ? 200 : 404 });
}
