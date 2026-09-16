import type { Metadata } from 'next';
import { listAllSessions } from '@/lib/db/repositories/sessions';
import { findUserById } from '@/lib/db/repositories/users';
import { countTurns } from '@/lib/db/repositories/turns';
import { SessionTable, type SessionRow } from './SessionTable';

export const metadata: Metadata = { title: 'Sessions' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function InterviewerSessionsPage() {
  let rows: SessionRow[] = [];
  let error: string | null = null;

  try {
    const sessions = await listAllSessions(200);
    rows = await Promise.all(
      sessions.map(async (s) => {
        const user = await findUserById(s.userId.toHexString());
        return {
          id: s._id.toHexString(),
          // PRD §8.3 — the pseudonym is the only identifier rendered by default.
          pseudonym: user?.pseudonym ?? 'Candidate #????',
          role: s.roleTitle,
          level: s.level,
          status: s.status,
          startedAt: s.startedAt.toISOString(),
          overallScore: s.overallScore,
          turnCount: await countTurns(s._id),
          difficultyChanges: s.difficultyChanges.length,
        };
      }),
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const completed = rows.filter((r) => r.status === 'completed');
  const meanScore =
    completed.length > 0
      ? Math.round(
          completed.reduce((a, r) => a + (r.overallScore ?? 0), 0) / completed.length,
        )
      : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight">Sessions</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Candidates are shown by pseudonym. Names, emails and CV content are never rendered here
            unless you explicitly reveal a single session, which is recorded in the audit log.
          </p>
        </div>
        <dl className="flex gap-8">
          <Stat label="Sessions" value={rows.length} />
          <Stat label="Completed" value={completed.length} />
          <Stat label="Mean score" value={meanScore ?? '—'} />
        </dl>
      </div>

      {error ? (
        <div className="mt-8 rounded-xl border border-warn/40 bg-warn-soft p-5">
          <p className="text-sm font-medium text-warn">Cannot reach the database</p>
          <p className="mt-2 font-mono text-xs text-muted">{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted">
          No interviews have been run yet.
        </p>
      ) : (
        <SessionTable rows={rows} />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-medium tabular-nums">{value}</dd>
    </div>
  );
}
