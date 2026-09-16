import type { Metadata } from 'next';
import Link from 'next/link';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { listSessionsForUser } from '@/lib/db/repositories/sessions';
import type { SessionDoc } from '@/lib/db/models';
import { Badge } from '@/components/ui/Surface';

export const metadata: Metadata = { title: 'Dashboard' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;

  let sessions: SessionDoc[] = [];
  let dbError: string | null = null;

  if (userId && ObjectId.isValid(userId)) {
    try {
      sessions = await listSessionsForUser(new ObjectId(userId));
    } catch (e) {
      // A dead database should explain itself, not throw a 500 at the candidate.
      dbError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            {greeting()}, {session?.user?.name?.split(' ')[0] ?? 'there'}
          </h1>
          <p className="mt-2 text-muted">Practice interviews you have run, most recent first.</p>
        </div>
        <Link
          href="/setup"
          className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white transition-[filter] hover:brightness-110"
        >
          Start an interview
        </Link>
      </div>

      {dbError ? (
        <ErrorState detail={dbError} />
      ) : sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mt-10 px-2 divide-y divide-line border-t border-line">
          {sessions.map((s) => (
            <SessionRow key={s._id.toHexString()} session={s} />
          ))}
        </ul>
      )}
    </>
  );
}

function SessionRow({ session }: { session: SessionDoc }) {
  const id = session._id.toHexString();
  const score = session.overallScore;
  return (
    <li>
      <Link
        href={session.status === 'completed' ? `/results/${id}` : `/interview/${id}`}
        className="flex items-center gap-4 py-4 transition-colors hover:bg-raised/60"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{session.roleTitle}</p>
          <p className="mt-1 text-xs text-muted">
            {session.level} · {session.startedAt.toLocaleDateString()} ·{' '}
            {session.difficultyChanges.length > 0
              ? `${session.difficultyChanges.length} difficulty change${session.difficultyChanges.length === 1 ? '' : 's'}`
              : 'no difficulty change'}
          </p>
        </div>
        {session.status === 'in_progress' && <Badge tone="warn">In progress</Badge>}
        {session.status === 'abandoned' && <Badge>Abandoned</Badge>}
        {score !== null && (
          <span className="tabular-nums text-lg font-medium">{Math.round(score)}</span>
        )}
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="mt-16 border-t border-line pt-16 text-center">
      <p className="text-lg font-medium">No interviews yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        Add your CV first so the interviewer can ask about work you have actually done. Without it
        you will get a generic interview for the role instead.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link
          href="/profile"
          className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white transition-[filter] hover:brightness-110"
        >
          Add your background
        </Link>
        <Link
          href="/setup"
          className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-muted/60"
        >
          Skip and start
        </Link>
      </div>
    </div>
  );
}

function ErrorState({ detail }: { detail: string }) {
  return (
    <div className="mt-10 rounded-xl border border-warn/40 bg-warn-soft p-5">
      <p className="text-sm font-medium text-warn">Cannot reach the database</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Your interview history could not be loaded. Check that <code>MONGODB_URI</code> points at a
        reachable cluster.
      </p>
      <p className="mt-3 font-mono text-xs text-muted">{detail}</p>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
