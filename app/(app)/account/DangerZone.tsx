'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

/**
 * PRD §8.4 — right of access and right of erasure, as two buttons rather than
 * an email address to write to.
 *
 * The delete requires typing DELETE. Not friction for its own sake: this is
 * irreversible and immediate, and a mis-click would destroy work the candidate
 * cannot get back.
 */
export function DangerZone() {
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  async function exportData() {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch('/api/privacy/export');
      if (!response.ok) throw new Error('Could not build your export.');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-interview-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  async function deleteEverything() {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch('/api/privacy/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not delete your data.');

      // The account is gone, so there is nowhere signed-in to go back to.
      window.location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  return (
    <>
      <section className="mt-12 border-t border-line pt-10">
        <h2 className="text-lg font-medium">Take a copy</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Downloads everything held about you as a JSON file, your documents, the facts extracted
          from them, and every interview with its questions, answers and scores, decrypted and
          readable.
        </p>
        <Button variant="secondary" loading={exporting} onClick={() => void exportData()} className="mt-4">
          Download my data
        </Button>
      </section>

      <section className="mt-12 rounded-xl border border-danger/30 p-5">
        <h2 className="text-lg font-medium text-danger">Delete everything</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Permanently removes your account, your documents, your extracted facts and every
          interview transcript and score. This happens immediately and cannot be undone. Consider
          downloading a copy first.
        </p>

        {!armed ? (
          <Button variant="danger" onClick={() => setArmed(true)} className="mt-4">
            I want to delete my data
          </Button>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <Input
              label="Type DELETE to confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              aria-describedby="delete-warning"
            />
            <p id="delete-warning" className="text-xs text-muted">
              There is no recovery and no grace period.
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={confirm !== 'DELETE'}
                loading={deleting}
                onClick={() => void deleteEverything()}
              >
                Delete everything permanently
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setArmed(false);
                  setConfirm('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
      </section>
    </>
  );
}
