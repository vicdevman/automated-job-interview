'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { CONSENT_COPY } from '@/lib/interview/consent';
import { startCapture, MicPermissionError, type MicCapture } from '@/lib/audio/capture';
import { playAudioResponse, unlockPlayback } from '@/lib/audio/playback';

interface Role {
  id: string;
  title: string;
  description: string;
  competencies: string[];
  levels: string[];
}

const LEVELS = [
  { id: 'junior', label: 'Junior', hint: 'Fundamentals and guided scenarios' },
  { id: 'mid', label: 'Mid', hint: 'Trade-offs, ownership, worked examples' },
  { id: 'senior', label: 'Senior', hint: 'Ambiguity and systemic thinking' },
] as const;

const VOICES = [
  { id: 'theo', label: 'Theo', hint: 'British, male' },
  { id: 'sarah', label: 'Sarah', hint: 'British, female' },
  { id: 'jack', label: 'Jack', hint: 'American, male' },
  { id: 'megan', label: 'Megan', hint: 'American, female' },
] as const;

export function SetupWizard({
  roles,
  confirmedFactCount,
}: {
  roles: Role[];
  confirmedFactCount: number;
}) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');
  const [level, setLevel] = useState<'junior' | 'mid' | 'senior'>('mid');
  const [voiceId, setVoiceId] = useState('theo');
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = roles.find((r) => r.id === roleId);
  const availableLevels = role?.levels ?? ['junior', 'mid', 'senior'];

  useEffect(() => {
    if (role && !role.levels.includes(level)) {
      setLevel((role.levels[0] as 'junior' | 'mid' | 'senior') ?? 'mid');
    }
  }, [role, level]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      // Unlock audio inside the click, or the browser will refuse to play the
      // first question.
      await unlockPlayback();

      const response = await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId, level, voiceId, consent: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not start the interview.');

      router.push(`/interview/${body.sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-10 sm:mt-10 sm:gap-12">
      {/* 1 — role */}
      <Step n={1} title="Which role are you practising for?">
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRoleId(r.id)}
              aria-pressed={roleId === r.id}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors',
                roleId === r.id
                  ? 'border-accent bg-accent-soft'
                  : 'border-line hover:border-muted/60',
              )}
            >
              <span className="text-sm font-medium">{r.title}</span>
              <span className="mt-1.5 block text-xs leading-relaxed text-muted">
                {r.description}
              </span>
            </button>
          ))}
        </div>
      </Step>

      {/* 2 — level */}
      <Step n={2} title="At what level?">
        <div className="flex flex-wrap gap-3">
          {LEVELS.filter((l) => availableLevels.includes(l.id)).map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLevel(l.id)}
              aria-pressed={level === l.id}
              className={cn(
                'rounded-xl border px-4 py-3 text-left transition-colors',
                level === l.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-muted/60',
              )}
            >
              <span className="text-sm font-medium">{l.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{l.hint}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          This is only the starting point — the interview gets harder or easier based on how you
          answer.
        </p>
      </Step>

      {/* 3 — voice + mic */}
      <Step n={3} title="Check your voice and microphone">
        <VoicePicker voiceId={voiceId} onChange={setVoiceId} />
        <MicTest />
      </Step>

      {/* 4 — consent */}
      <Step n={4} title={CONSENT_COPY.heading}>
        <ul className="flex flex-col gap-2">
          {CONSENT_COPY.points.map((point) => (
            <li key={point} className="flex gap-2.5 text-sm leading-relaxed text-muted">
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
              {point}
            </li>
          ))}
        </ul>

        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>{CONSENT_COPY.agree}</span>
        </label>
      </Step>

      {/* start */}
      <div className="border-t border-line pt-8">
        {confirmedFactCount === 0 && (
          <p className="mb-4 text-sm text-warn">
            You have no confirmed background, so this will be a generic interview for the role.{' '}
            <Link href="/profile" className="font-medium underline">
              Add your CV
            </Link>{' '}
            to be asked about your actual work.
          </p>
        )}
        {confirmedFactCount > 0 && (
          <p className="mb-4 text-sm text-positive">
            Questions will be built from {confirmedFactCount} confirmed fact
            {confirmedFactCount === 1 ? '' : 's'} about your background.
          </p>
        )}

        {error && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {error}
          </p>
        )}

        <Button size="lg" disabled={!consent || !roleId} loading={starting} onClick={() => void start()}>
          {starting ? 'Preparing your questions…' : 'Begin interview'}
        </Button>
        {!consent && (
          <p className="mt-2 text-xs text-muted">Tick the box above to continue.</p>
        )}
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2.5 text-lg font-medium">
        <span className="grid size-6 place-items-center rounded-full border border-line text-xs text-muted">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function VoicePicker({ voiceId, onChange }: { voiceId: string; onChange: (id: string) => void }) {
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function preview(id: string) {
    setPreviewing(id);
    setError(null);
    try {
      await unlockPlayback();
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Thanks for joining me today. Whenever you are ready, we can begin.',
          voiceId: id,
        }),
      });
      if (!response.ok) throw new Error('Could not play that voice.');
      const handle = await playAudioResponse(response);
      await handle.finished;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(null);
    }
  }

  return (
    <div>
      <p className="text-sm font-medium">Interviewer voice</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {VOICES.map((v) => (
          <div
            key={v.id}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
              voiceId === v.id ? 'border-accent bg-accent-soft' : 'border-line',
            )}
          >
            <button
              type="button"
              onClick={() => onChange(v.id)}
              aria-pressed={voiceId === v.id}
              className="text-left"
            >
              <span className="text-sm font-medium">{v.label}</span>
              <span className="block text-xs text-muted">{v.hint}</span>
            </button>
            <button
              type="button"
              onClick={() => void preview(v.id)}
              disabled={previewing !== null}
              aria-label={`Hear ${v.label}`}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-text disabled:opacity-40"
            >
              {previewing === v.id ? <Dots /> : <PlayIcon />}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** PRD §7 setup requirement — prove the mic works before the interview, not during it. */
function MicTest() {
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'failed'>('idle');
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const captureRef = useRef<MicCapture | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      void captureRef.current?.stop();
    },
    [],
  );

  async function run() {
    setState('testing');
    setError(null);
    setPeak(0);
    try {
      const capture = await startCapture(
        { sampleRate: 16000, encoding: 'pcm_s16le', frameSize: 1024 },
        {
          onFrame: () => {},
          onLevel: (rms) => {
            setLevel(rms);
            setPeak((p) => Math.max(p, rms));
          },
          onError: (e) => setError(e.message),
        },
      );
      captureRef.current = capture;

      stopTimer.current = setTimeout(() => {
        void capture.stop();
        captureRef.current = null;
        setLevel(0);
        setState((prev) => (prev === 'testing' ? 'ok' : prev));
      }, 5000);
    } catch (e) {
      setError(
        e instanceof MicPermissionError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not open the microphone.',
      );
      setState('failed');
    }
  }

  return (
    <div className="mt-6">
      <p className="text-sm font-medium">Microphone</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Button variant="secondary" size="sm" onClick={() => void run()} disabled={state === 'testing'}>
          {state === 'testing' ? 'Say something…' : state === 'ok' ? 'Test again' : 'Test microphone'}
        </Button>

        <div className="flex items-center gap-2">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-line sm:w-40">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-75"
              style={{ width: `${Math.min(100, level * 400)}%` }}
            />
          </div>
          {state === 'testing' && <span className="text-xs text-muted">listening…</span>}
        </div>
      </div>

      {state === 'ok' && (
        <p className={cn('mt-3 text-sm', peak > 0.02 ? 'text-positive' : 'text-warn')}>
          {peak > 0.02
            ? 'Your microphone is working.'
            : 'Nothing was picked up. Check that the right microphone is selected and try again.'}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-muted">
        You can also answer by typing at any point, so a broken microphone is not a blocker.
      </p>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

function Dots() {
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1 animate-pulse rounded-full bg-current"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
