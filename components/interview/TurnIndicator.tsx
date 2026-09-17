'use client';

import { cn } from '@/lib/cn';
import type { InterviewState } from '@/lib/interview/useInterview';
import { CheckIcon, MicIcon, ThinkingDotsIcon, WaveformIcon } from './CallIcons';

/**
 * PRD §11.3 — ONE state indicator that changes, never three at once.
 *
 * Speaking / Listening / Thinking are mutually exclusive, so they share a
 * single element that changes icon, label and tone rather than three elements
 * that light up independently. Each state gets its own glyph — a waveform
 * while the interviewer talks, a mic while you do, dots while it thinks — so
 * the status reads at a glance the way a real call's status bar does, not
 * just from the word.
 */

const COPY: Record<InterviewState, { label: string; tone: string }> = {
  connecting: { label: 'Connecting', tone: 'text-muted' },
  speaking: { label: 'Interviewer speaking', tone: 'text-muted' },
  listening: { label: 'Listening', tone: 'text-accent' },
  thinking: { label: 'Thinking', tone: 'text-muted' },
  finished: { label: 'Finished', tone: 'text-positive' },
  error: { label: 'Something went wrong', tone: 'text-danger' },
};

function StateIcon({ state }: { state: InterviewState }) {
  const cls = 'size-3.5';
  switch (state) {
    case 'listening':
      return <MicIcon className={cls} />;
    case 'speaking':
      return <WaveformIcon className={cls} />;
    case 'thinking':
    case 'connecting':
      return <ThinkingDotsIcon className={cls} />;
    case 'finished':
      return <CheckIcon className={cls} />;
    default:
      return <span aria-hidden="true" className="size-2 rounded-full bg-current" />;
  }
}

export function TurnIndicator({ state, level }: { state: InterviewState; level: number }) {
  const { label, tone } = COPY[state];

  return (
    <div
      className={cn('flex items-center gap-2 text-sm font-medium', tone)}
      role="status"
      aria-live="polite"
    >
      <span className="relative grid size-6 place-items-center">
        {state === 'listening' && (
          <span
            aria-hidden="true"
            className="absolute rounded-full bg-accent/20"
            style={{
              width: `${20 + Math.min(20, level * 260)}px`,
              height: `${20 + Math.min(20, level * 260)}px`,
              transition: 'width 90ms linear, height 90ms linear',
            }}
          />
        )}
        <span
          className={cn(
            'relative grid place-items-center',
            state === 'thinking' && 'animate-pulse',
          )}
        >
          <StateIcon state={state} />
        </span>
      </span>
      <span className="inline">{label}</span>
    </div>
  );
}

/** PRD §6.4 — live, non-intrusive pace feedback. Never blocks, never interrupts. */
export function PaceMeter({ wpm, fillerCount }: { wpm: number | null; fillerCount: number }) {
  if (wpm === null) return null;

  const inBand = wpm >= 120 && wpm <= 160;
  const hint = inBand ? 'good pace' : wpm < 120 ? 'a little slow' : 'slow down a touch';

  return (
    <div className="flex items-center gap-4 text-xs tabular-nums">
      <span className={cn('font-medium', inBand ? 'text-positive' : 'text-warn')}>
        {wpm} wpm
        <span className="ml-1.5 hidden font-normal text-muted sm:inline">{hint}</span>
      </span>
      {fillerCount > 2 && (
        <span className="text-muted">
          {fillerCount} filler{fillerCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}
