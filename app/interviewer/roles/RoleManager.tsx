'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Surface';
import { cn } from '@/lib/cn';

export interface RoleRow {
  id: string;
  title: string;
  description: string;
  competencies: string[];
  levels: string[];
  questionBanks: number;
}

const ALL_LEVELS = ['junior', 'mid', 'senior'] as const;

type Draft = {
  id?: string;
  title: string;
  description: string;
  competencies: string;
  levels: string[];
};

const EMPTY: Draft = { title: '', description: '', competencies: '', levels: ['junior', 'mid', 'senior'] };

export function RoleManager({ initialRoles }: { initialRoles: RoleRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);

    const payload = {
      ...(draft.id ? { id: draft.id } : {}),
      title: draft.title.trim(),
      description: draft.description.trim(),
      competencies: draft.competencies
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
      levels: draft.levels,
    };

    try {
      const response = await fetch('/api/interviewer/roles', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not save that role.');
      setDraft(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/interviewer/roles?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      setConfirmDelete(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      {!draft && (
        <Button onClick={() => setDraft({ ...EMPTY })}>Add a role</Button>
      )}

      {draft && (
        <div className="rounded-xl border border-line bg-raised p-5">
          <h2 className="text-lg font-medium">{draft.id ? 'Edit role' : 'New role'}</h2>

          <div className="mt-4 flex flex-col gap-4">
            <Input
              label="Title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Software Engineer"
            />
            <Textarea
              label="Description"
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              hint="What the person actually does. This is fed straight into question generation, so be specific."
              placeholder="Designs, builds and maintains production software. Expected to reason about trade-offs…"
            />
            <Input
              label="Competencies"
              value={draft.competencies}
              onChange={(e) => setDraft({ ...draft, competencies: e.target.value })}
              hint="Comma separated. Each one can become a question."
              placeholder="Problem solving, System design, Debugging under pressure"
            />

            <div>
              <p className="mb-2 text-sm font-medium">Levels offered</p>
              <div className="flex gap-2">
                {ALL_LEVELS.map((level) => {
                  const on = draft.levels.includes(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          levels: on
                            ? draft.levels.filter((l) => l !== level)
                            : [...draft.levels, level],
                        })
                      }
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors',
                        on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted',
                      )}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                loading={busy}
                disabled={
                  draft.title.trim().length < 2 ||
                  draft.description.trim().length < 10 ||
                  draft.competencies.trim().length === 0 ||
                  draft.levels.length === 0
                }
                onClick={() => void save()}
              >
                {draft.id ? 'Save changes' : 'Create role'}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <ul className="mt-8 divide-y divide-line border-t border-line">
        {initialRoles.map((role) => (
          <li key={role.id} className="group py-5">
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{role.title}</h3>
                  {role.levels.map((l) => (
                    <Badge key={l}>{l}</Badge>
                  ))}
                  {role.questionBanks > 0 && (
                    <Badge tone="accent">
                      {role.questionBanks} cached bank{role.questionBanks === 1 ? '' : 's'}
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{role.description}</p>
                <p className="mt-2 text-xs text-muted">
                  {role.competencies.join(' · ')}
                </p>
              </div>

              <div className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({
                      id: role.id,
                      title: role.title,
                      description: role.description,
                      competencies: role.competencies.join(', '),
                      levels: role.levels,
                    })
                  }
                >
                  Edit
                </Button>
                {confirmDelete === role.id ? (
                  <>
                    <Button size="sm" variant="danger" loading={busy} onClick={() => void remove(role.id)}>
                      Really delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(role.id)}>
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {initialRoles.length === 0 && (
        <p className="mt-16 text-center text-sm text-muted">
          No roles yet. Add one, or run <code className="font-mono">npm run seed</code> for the
          starter set.
        </p>
      )}
    </div>
  );
}
