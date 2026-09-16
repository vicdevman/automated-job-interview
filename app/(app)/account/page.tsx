import type { Metadata } from 'next';
import Link from 'next/link';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { listDocuments } from '@/lib/db/repositories/documents';
import { listFacts } from '@/lib/db/repositories/facts';
import { listSessionsForUser } from '@/lib/db/repositories/sessions';
import { DangerZone } from './DangerZone';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Your data' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PRD §8.4 — the candidate's own controls over their data, not buried. */
export default async function AccountPage() {
  const session = await auth();
  const userId = session?.user?.id;

  let counts = { documents: 0, facts: 0, sessions: 0 };
  let error: string | null = null;

  if (userId && ObjectId.isValid(userId)) {
    try {
      const oid = new ObjectId(userId);
      const [documents, facts, sessions] = await Promise.all([
        listDocuments(oid),
        listFacts(oid),
        listSessionsForUser(oid, 500),
      ]);
      counts = { documents: documents.length, facts: facts.length, sessions: sessions.length };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <>
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Your data</h1>
      <p className="mt-2 max-w-2xl leading-relaxed text-muted">
        Everything this system holds about you, and what you can do with it.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-medium">What is stored</h2>
        <dl className="mt-4 flex flex-wrap gap-10">
          <Count label="Documents and links" value={counts.documents} />
          <Count label="Extracted facts" value={counts.facts} />
          <Count label="Interviews" value={counts.sessions} />
        </dl>

        <ul className="mt-6 flex max-w-2xl flex-col gap-2 text-sm leading-relaxed text-muted">
          <li className="flex gap-2.5">
            <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-positive" />
            <span>
              <strong className="font-medium text-text">No audio exists.</strong> Your speech is
              streamed straight to transcription and discarded. There is no recording of your voice
              anywhere in this system, and there never was.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
            <span>
              Your CV text, extracted facts and interview transcripts are encrypted before they are
              written to the database. Anyone reading the database directly sees ciphertext.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
            <span>
              Transcripts are automatically deleted after {env.RETENTION_DAYS} days. Your scores
              remain so you keep a record of having practised.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
            <span>
              Interviewers see you as a pseudonym by default. If one reveals your identity, that is
              recorded permanently in an audit log.
            </span>
          </li>
        </ul>

        <p className="mt-6 text-sm">
          <Link href="/privacy" className="text-accent underline-offset-4 hover:underline">
            Read the full privacy policy
          </Link>
        </p>
      </section>

      {error ? (
        <div className="mt-10 rounded-xl border border-warn/40 bg-warn-soft p-5">
          <p className="text-sm font-medium text-warn">Cannot reach the database</p>
          <p className="mt-2 font-mono text-xs text-muted">{error}</p>
        </div>
      ) : (
        <DangerZone />
      )}
    </>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-medium tabular-nums">{value}</dd>
    </div>
  );
}
