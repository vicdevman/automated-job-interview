import 'server-only';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';

/**
 * PRD §1.2 — two roles, and the interviewer console must never be reachable by
 * a candidate. Returning a plain object rather than throwing keeps the route
 * handlers readable.
 */
export async function requireInterviewer(): Promise<
  { ok: true; userId: ObjectId; email: string } | { ok: false; status: 401 | 403 }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401 };
  if (session.user.role !== 'interviewer') return { ok: false, status: 403 };
  return { ok: true, userId: new ObjectId(session.user.id), email: session.user.email ?? '' };
}

export async function requireCandidate(): Promise<
  { ok: true; userId: ObjectId } | { ok: false; status: 401 }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401 };
  return { ok: true, userId: new ObjectId(session.user.id) };
}
