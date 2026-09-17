import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { listFacts } from '@/lib/db/repositories/facts';
import { listDocuments } from '@/lib/db/repositories/documents';
import { ProfileEditor } from './ProfileEditor';
import type { CandidateFact } from '@/lib/db/models';

export const metadata: Metadata = { title: 'Your background' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await auth();
  const userId = session?.user?.id;

  let facts: CandidateFact[] = [];
  let documents: Array<{ id: string; kind: string; label: string }> = [];
  let error: string | null = null;

  if (userId && ObjectId.isValid(userId)) {
    try {
      const oid = new ObjectId(userId);
      facts = await listFacts(oid);
      documents = (await listDocuments(oid)).map((d) => ({
        id: d.id,
        kind: d.kind,
        label: d.filename ?? d.url ?? 'Untitled',
      }));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Your background</h1>
      <p className="mt-2 max-w-2xl leading-relaxed text-muted">
        The interviewer only asks about things it can find in your own words. Add your CV, a link,
        or just type a summary, then check what it understood before you start.
      </p>

      {error ? (
        <div className="mt-8 rounded-xl border border-warn/40 bg-warn-soft p-5">
          <p className="text-sm font-medium text-warn">Cannot reach the database</p>
          <p className="mt-2 font-mono text-xs text-muted">{error}</p>
        </div>
      ) : (
        <ProfileEditor initialFacts={facts} initialDocuments={documents} />
      )}
    </>
  );
}
