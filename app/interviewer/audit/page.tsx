import type { Metadata } from 'next';
import { listAudit } from '@/lib/db/repositories/audit';
import { Badge } from '@/components/ui/Surface';

export const metadata: Metadata = { title: 'Audit log' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PRD §8.3 — the record that makes "reveals are audited" checkable rather than claimed. */
const TONE: Record<string, 'accent' | 'warn' | 'danger' | 'positive' | 'neutral'> = {
  'session.reveal_identity': 'warn',
  'privacy.delete': 'danger',
  'privacy.export': 'accent',
  'facts.confirm': 'positive',
};

const DESCRIPTION: Record<string, string> = {
  'session.reveal_identity': 'A candidate’s identity was revealed on a session',
  'privacy.delete': 'A candidate deleted all of their data',
  'privacy.export': 'A candidate exported their data',
  'facts.confirm': 'A candidate confirmed their extracted facts',
  'role.create': 'A role was created',
  'role.update': 'A role was edited',
  'role.delete': 'A role was deleted',
  'questions.generate': 'A question bank was regenerated',
};

export default async function AuditPage() {
  let entries: Awaited<ReturnType<typeof listAudit>> = [];
  let error: string | null = null;

  try {
    entries = await listAudit(200);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Audit log</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Every identity reveal, data export and deletion is recorded here. Deletion entries
        deliberately do not name the person deleted — keeping that would defeat the deletion.
      </p>

      {error ? (
        <div className="mt-8 rounded-xl border border-warn/40 bg-warn-soft p-5">
          <p className="text-sm font-medium text-warn">Cannot reach the database</p>
          <p className="mt-2 font-mono text-xs text-muted">{error}</p>
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted">Nothing has been logged yet.</p>
      ) : (
        <ul className="mt-8 divide-y divide-line border-t border-line">
          {entries.map((e) => (
            <li key={e._id.toHexString()} className="flex flex-wrap items-center gap-3 py-3.5 text-sm">
              <Badge tone={TONE[e.action] ?? 'neutral'}>{e.action}</Badge>
              <span className="flex-1">{DESCRIPTION[e.action] ?? e.action}</span>
              {e.subjectId && (
                <span className="font-mono text-xs text-muted">{e.subjectId.slice(-8)}</span>
              )}
              <time className="text-xs text-muted" dateTime={e.createdAt.toISOString()}>
                {e.createdAt.toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
