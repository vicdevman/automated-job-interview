import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { listRoles } from '@/lib/db/repositories/roles';
import { listConfirmedFacts } from '@/lib/db/repositories/facts';
import { SetupWizard } from './SetupWizard';

export const metadata: Metadata = { title: 'New interview' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const session = await auth();
  const userId = session?.user?.id;

  let roles: Array<{
    id: string;
    title: string;
    description: string;
    competencies: string[];
    levels: string[];
  }> = [];
  let confirmedFactCount = 0;
  let error: string | null = null;

  try {
    roles = (await listRoles()).map((r) => ({
      id: r._id.toHexString(),
      title: r.title,
      description: r.description,
      competencies: r.competencies,
      levels: r.levels,
    }));
    if (userId && ObjectId.isValid(userId)) {
      confirmedFactCount = (await listConfirmedFacts(new ObjectId(userId))).length;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Set up your interview</h1>
      <p className="mt-2 text-muted">Four quick things, then we begin.</p>

      {error ? (
        <div className="mt-8 rounded-xl border border-warn/40 bg-warn-soft p-5">
          <p className="text-sm font-medium text-warn">Cannot reach the database</p>
          <p className="mt-2 font-mono text-xs text-muted">{error}</p>
        </div>
      ) : roles.length === 0 ? (
        <div className="mt-8 rounded-xl border border-warn/40 bg-warn-soft p-5">
          <p className="text-sm font-medium text-warn">No roles have been set up yet</p>
          <p className="mt-2 text-sm text-muted">
            An interviewer needs to create at least one role. If this is your own deployment, run{' '}
            <code className="font-mono">npm run seed</code>.
          </p>
        </div>
      ) : (
        <SetupWizard roles={roles} confirmedFactCount={confirmedFactCount} />
      )}
    </>
  );
}
