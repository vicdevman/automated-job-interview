import type { Metadata } from 'next';
import { listRoles } from '@/lib/db/repositories/roles';
import { listQuestionSets } from '@/lib/db/repositories/questionSets';
import { RoleManager, type RoleRow } from './RoleManager';

export const metadata: Metadata = { title: 'Roles' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  let roles: RoleRow[] = [];
  let error: string | null = null;

  try {
    const [all, sets] = await Promise.all([listRoles(), listQuestionSets(200)]);

    // How many cached question banks exist per role, so an interviewer can see
    // what has actually been generated.
    const bankCount = new Map<string, number>();
    for (const set of sets) {
      bankCount.set(set.roleId, (bankCount.get(set.roleId) ?? 0) + 1);
    }

    roles = all.map((r) => ({
      id: r._id.toHexString(),
      title: r.title,
      description: r.description,
      competencies: r.competencies,
      levels: r.levels,
      questionBanks: bankCount.get(r._id.toHexString()) ?? 0,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Roles</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        A role is what questions are generated from. The description and competencies go directly
        into the prompt, so specific wording here produces better questions than generic wording.
      </p>

      {error ? (
        <div className="mt-8 rounded-xl border border-warn/40 bg-warn-soft p-5">
          <p className="text-sm font-medium text-warn">Cannot reach the database</p>
          <p className="mt-2 font-mono text-xs text-muted">{error}</p>
        </div>
      ) : (
        <RoleManager initialRoles={roles} />
      )}
    </>
  );
}
