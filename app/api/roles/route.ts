import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listRoles } from '@/lib/db/repositories/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Roles available to a candidate on the setup screen. Read-only; CRUD lives under /api/interviewer. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const roles = await listRoles();
  return NextResponse.json({
    roles: roles.map((r) => ({
      id: r._id.toHexString(),
      title: r.title,
      description: r.description,
      competencies: r.competencies,
      levels: r.levels,
    })),
  });
}
