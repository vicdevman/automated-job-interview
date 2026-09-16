'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Surface';
import { cn } from '@/lib/cn';
import type { CandidateFact, FactKind } from '@/lib/db/models';

/**
 * PRD §5.3 — the candidate review step.
 *
 * Two jobs: catch extraction errors, and get an affirmative confirmation that
 * the system's belief about this person is correct. Only confirmed facts can
 * ground a question, so this screen is load-bearing rather than cosmetic.
 */

type Source = { id: string; kind: string; label: string };

const KIND_LABEL: Record<FactKind, string> = {
  employment: 'Role',
  project: 'Project',
  education: 'Education',
  skill: 'Skill',
  achievement: 'Achievement',
  gap: 'Career break',
};

export function ProfileEditor({
  initialFacts,
  initialDocuments,
}: {
  initialFacts: CandidateFact[];
  initialDocuments: Source[];
}) {
  const [facts, setFacts] = useState(initialFacts);
  const [documents, setDocuments] = useState(initialDocuments);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState('');
  const [url, setUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const unconfirmed = facts.filter((f) => !f.confirmedByUser);

  function absorb(
    payload: { facts?: CandidateFact[]; documentId?: string; stats?: { discarded: number } },
    label: string,
  ) {
    if (payload.facts?.length) {
      setFacts((prev) => [...prev, ...payload.facts!]);
    }
    if (payload.documentId) {
      setDocuments((prev) => [...prev, { id: payload.documentId!, kind: 'cv', label }]);
    }
    const discarded = payload.stats?.discarded ?? 0;
    setNotice(
      payload.facts?.length
        ? `Found ${payload.facts.length} fact${payload.facts.length === 1 ? '' : 's'}.` +
            (discarded > 0
              ? ` ${discarded} were discarded because they could not be traced to your exact words.`
              : '')
        : 'Nothing could be extracted from that. Try adding more detail.',
    );
  }

  async function post(path: string, init: RequestInit, key: string, label: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(path, init);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
      absorb(body, label);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function uploadCv(file: File) {
    const form = new FormData();
    form.append('file', file);
    await post('/api/profile/cv', { method: 'POST', body: form }, 'cv', file.name);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function confirmAll() {
    const ids = unconfirmed.map((f) => f.id);
    if (ids.length === 0) return;
    setBusy('confirm');
    try {
      const response = await fetch('/api/profile/facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error('Could not confirm those.');
      setFacts((prev) => prev.map((f) => ({ ...f, confirmedByUser: true })));
      setNotice('Confirmed. Those facts can now be used to build your questions.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function removeFact(id: string) {
    setFacts((prev) => prev.filter((f) => f.id !== id));
    await fetch(`/api/profile/facts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function saveSummary(id: string, summary: string) {
    setFacts((prev) => prev.map((f) => (f.id === id ? { ...f, summary } : f)));
    startTransition(() => {
      void fetch('/api/profile/facts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, summary }),
      });
    });
  }

  return (
    <div className="mt-8 flex flex-col gap-10 sm:mt-10 sm:gap-12">
      {/* ── inputs ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-medium">Add something about yourself</h2>
        <p className="mt-1 text-sm text-muted">Any one of these is enough. More is better.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label
            className={cn(
              'flex cursor-pointer flex-col justify-between rounded-xl border border-dashed border-line p-4',
              'transition-colors hover:border-accent/60',
              busy === 'cv' && 'opacity-60',
            )}
          >
            <span className="text-sm font-medium">Upload a CV</span>
            <span className="mt-1 text-xs text-muted">PDF or DOCX, up to 10 MB</span>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadCv(file);
              }}
            />
            <span className="mt-3 text-xs font-medium text-accent">
              {busy === 'cv' ? 'Reading it…' : 'Choose a file'}
            </span>
          </label>

          <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <span className="text-sm font-medium">Add a link</span>
            <span className="text-xs text-muted">Portfolio or profile page</span>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              aria-label="URL"
              className="mt-1"
            />
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'url'}
              disabled={!url.trim() || busy !== null}
              onClick={() =>
                void post(
                  '/api/profile/url',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, kind: 'url' }),
                  },
                  'url',
                  url,
                ).then(() => setUrl(''))
              }
            >
              Read page
            </Button>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <span className="text-sm font-medium">Or just type it</span>
            <span className="text-xs text-muted">A paragraph about your work</span>
            <Textarea
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              rows={3}
              placeholder="I am a backend engineer. Between 2021 and 2023 I…"
              aria-label="Typed summary"
              className="mt-1"
            />
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'text'}
              disabled={summaryText.trim().length < 100 || busy !== null}
              onClick={() =>
                void post(
                  '/api/profile/text',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: summaryText }),
                  },
                  'text',
                  'Typed summary',
                ).then(() => setSummaryText(''))
              }
            >
              {summaryText.trim().length < 100
                ? `${100 - summaryText.trim().length} more characters`
                : 'Use this'}
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        {notice && <p className="mt-4 text-sm text-positive">{notice}</p>}

        {documents.length > 0 && (
          <p className="mt-4 text-xs text-muted">
            Sources: {documents.map((d) => d.label).join(' · ')}
          </p>
        )}
      </section>

      {/* ── review ──────────────────────────────────────────────────────── */}
      <section className="border-t border-line pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">What the interviewer understood</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
              Each of these is traced to a line you actually wrote — hover the quote to see it. Fix
              anything wrong and delete anything you would rather not be asked about.
            </p>
          </div>
          {unconfirmed.length > 0 && (
            <Button loading={busy === 'confirm'} onClick={() => void confirmAll()}>
              Confirm {unconfirmed.length}
            </Button>
          )}
        </div>

        {facts.length === 0 ? (
          <p className="mt-8 text-sm text-muted">
            Nothing yet. Add a CV, a link or a summary above and your questions will be built from
            it. You can also skip this entirely and take a generic interview for the role.
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-line border-t border-line">
            {facts.map((fact) => (
              <FactRow
                key={fact.id}
                fact={fact}
                onChange={saveSummary}
                onDelete={() => void removeFact(fact.id)}
              />
            ))}
          </ul>
        )}

        <div className="mt-10 flex items-center gap-3">
          <Link
            href="/setup"
            className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white transition-[filter] hover:brightness-110"
          >
            Set up an interview
          </Link>
          {unconfirmed.length > 0 && (
            <span className="text-xs text-warn">
              {unconfirmed.length} unconfirmed — those will not be used yet.
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function FactRow({
  fact,
  onChange,
  onDelete,
}: {
  fact: CandidateFact;
  onChange: (id: string, summary: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.summary);

  return (
    <li className="group flex items-start gap-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{KIND_LABEL[fact.kind]}</Badge>
          {fact.confirmedByUser ? (
            <Badge tone="positive">Confirmed</Badge>
          ) : (
            <Badge tone="warn">Needs a look</Badge>
          )}
          {fact.confidence === 'low' && <Badge tone="warn">Low confidence</Badge>}
        </div>

        {editing ? (
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Edit this fact"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onChange(fact.id, draft.trim());
                  setEditing(false);
                }
                if (e.key === 'Escape') {
                  setDraft(fact.summary);
                  setEditing(false);
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                onChange(fact.id, draft.trim());
                setEditing(false);
              }}
            >
              Save
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-sm">{fact.summary}</p>
        )}

        <p className="mt-1.5 text-xs italic leading-relaxed text-muted">
          “{fact.evidence.quote}”
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </li>
  );
}
