import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireInterviewer } from '@/lib/auth-guards';
import { createRole, deleteRole, listRoles, updateRole } from '@/lib/db/repositories/roles';
import { recordAudit } from '@/lib/db/repositories/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PRD §10 — role and competency management. Interviewer only. */

const roleSchema = z.object({
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().min(10).max(2000),
  competencies: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  levels: z.array(z.enum(['junior', 'mid', 'senior'])).min(1),
});

export async function GET() {
  const guard = await requireInterviewer();
  if (!guard.ok) return NextResponse.json({ error: 'Not allowed.' }, { status: guard.status });

  const roles = await listRoles();
  return NextResponse.json({
    roles: roles.map((r) => ({
      id: r._id.toHexString(),
      title: r.title,
      description: r.description,
      competencies: r.competencies,
      levels: r.levels,
      updatedAt: r.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const guard = await requireInterviewer();
  if (!guard.ok) return NextResponse.json({ error: 'Not allowed.' }, { status: guard.status });

  const parsed = roleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid role.' }, { status: 400 });
  }

  const role = await createRole({ ...parsed.data, createdBy: guard.userId });
  await recordAudit({
    actorId: guard.userId,
    action: 'role.create',
    subjectId: role._id.toHexString(),
    meta: { title: role.title },
  });

  return NextResponse.json({ id: role._id.toHexString() }, { status: 201 });
}

export async function PATCH(request: Request) {
  const guard = await requireInterviewer();
  if (!guard.ok) return NextResponse.json({ error: 'Not allowed.' }, { status: guard.status });

  const parsed = roleSchema.partial().extend({ id: z.string().min(1) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid update.' }, { status: 400 });
  }

  const { id, ...patch } = parsed.data;
  const role = await updateRole(id, patch);
  if (!role) return NextResponse.json({ error: 'No such role.' }, { status: 404 });

  await recordAudit({ actorId: guard.userId, action: 'role.update', subjectId: id, meta: patch });
  return NextResponse.json({ id });
}

export async function DELETE(request: Request) {
  const guard = await requireInterviewer();
  if (!guard.ok) return NextResponse.json({ error: 'Not allowed.' }, { status: guard.status });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which role?' }, { status: 400 });

  const ok = await deleteRole(id);
  if (ok) await recordAudit({ actorId: guard.userId, action: 'role.delete', subjectId: id });
  return NextResponse.json({ deleted: ok }, { status: ok ? 200 : 404 });
}
