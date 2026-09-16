'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export interface SessionRow {
  id: string;
  pseudonym: string;
  role: string;
  level: string;
  status: string;
  startedAt: string;
  overallScore: number | null;
  turnCount: number;
  difficultyChanges: number;
}

interface Revealed {
  name: string;
  email: string;
  notice: string;
}

export function SessionTable({ rows }: { rows: SessionRow[] }) {
  const [revealed, setRevealed] = useState<Record<string, Revealed>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reveal(id: string) {
    setPending(id);
    setError(null);
    try {
      const response = await fetch(`/api/interviewer/sessions/${id}/reveal`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not reveal that candidate.');
      setRevealed((prev) => ({ ...prev, [id]: body }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
      setConfirming(null);
    }
  }

  return (
    <>
      {error && (
        <p role="alert" className="mt-6 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="pb-3 font-normal">Candidate</th>
              <th scope="col" className="pb-3 font-normal">Role</th>
              <th scope="col" className="pb-3 font-normal">Started</th>
              <th scope="col" className="pb-3 font-normal">Answers</th>
              <th scope="col" className="pb-3 font-normal">Adapted</th>
              <th scope="col" className="pb-3 text-right font-normal">Score</th>
              <th scope="col" className="pb-3 text-right font-normal">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const identity = revealed[row.id];
              return (
                <tr key={row.id}>
                  <td className="py-3.5 pr-4">
                    {identity ? (
                      <div>
                        <span className="font-medium">{identity.name}</span>
                        <span className="block text-xs text-muted">{identity.email}</span>
                      </div>
                    ) : (
                      <span className="font-mono text-xs">{row.pseudonym}</span>
                    )}
                  </td>
                  <td className="py-3.5 pr-4">
                    {row.role}
                    <span className="ml-2 text-xs text-muted">{row.level}</span>
                  </td>
                  <td className="py-3.5 pr-4 text-muted">
                    {new Date(row.startedAt).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 pr-4 tabular-nums text-muted">{row.turnCount}</td>
                  <td className="py-3.5 pr-4 text-muted">
                    {row.difficultyChanges > 0 ? (
                      <Badge tone="accent">
                        {row.difficultyChanges} change{row.difficultyChanges === 1 ? '' : 's'}
                      </Badge>
                    ) : (
                      <span className="text-xs">held</span>
                    )}
                  </td>
                  <td className="py-3.5 pr-4 text-right">
                    {row.status !== 'completed' ? (
                      <Badge tone={row.status === 'in_progress' ? 'warn' : 'neutral'}>
                        {row.status === 'in_progress' ? 'In progress' : 'Abandoned'}
                      </Badge>
                    ) : (
                      <span
                        className={cn(
                          'text-lg font-medium tabular-nums',
                          (row.overallScore ?? 0) >= 70
                            ? 'text-positive'
                            : (row.overallScore ?? 0) >= 45
                              ? 'text-text'
                              : 'text-warn',
                        )}
                      >
                        {Math.round(row.overallScore ?? 0)}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 text-right">
                    {identity ? (
                      <span className="text-xs text-muted">revealed &amp; logged</span>
                    ) : confirming === row.id ? (
                      <span className="inline-flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="danger"
                          loading={pending === row.id}
                          onClick={() => void reveal(row.id)}
                        >
                          Reveal &amp; log
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(row.id)}>
                        Reveal identity
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirming && (
        <p className="mt-4 text-xs text-warn">
          Revealing writes a permanent audit entry naming you and the session. Only do it when you
          have a reason you would be willing to state.
        </p>
      )}
    </>
  );
}
