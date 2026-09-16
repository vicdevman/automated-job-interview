'use client';

import { cn } from '@/lib/cn';
import type { InterviewState } from '@/lib/interview/useInterview';

/**
 * PRD §11.3 — ONE state indicator that changes, never three at once.
 *
 * Speaking / Listening / Thinking are mutually exclusive, so they share a
 * single element that changes label and behaviour rather than three elements
 * that light up independently.
 */

const COPY: Record<InterviewState, { label: string; tone: string }> = {
  connecting: { label: 'Connecting', tone: 'text-muted' },
  speaking: { label: 'Interviewer speaking', tone: 'text-muted' },
  listening: { label: 'Listening', tone: 'text-accent' },
  thinking: { label: 'Thinking', tone: 'text-muted' },
  finished: { label: 'Finished', tone: 'text-positive' },
  error: { label: 'Something went wrong', tone: 'text-danger' },
};

export function TurnIndicator({ state, level }: { state: InterviewState; level: number }) {
  const { label, tone } = COPY[state];

  return (
    <div className={cn('flex items-center gap-2.5 text-sm font-medium', tone)} role="status" aria-live="polite">
      <span className="relative grid size-3 place-items-center">
        {state === 'listening' && (
          <span
            aria-hidden="true"
            className="absolute rounded-full bg-accent/30"
            style={{
              width: `${12 + Math.min(20, level * 260)}px`,
              height: `${12 + Math.min(20, level * 260)}px`,
              transition: 'width 90ms linear, height 90ms linear',
            }}
          />
        )}
        <span
          aria-hidden="true"
          className={cn(
            'relative size-2.5 rounded-full bg-current',
            state === 'thinking' && 'animate-pulse',
          )}
        />
      </span>
      {label}
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
        <span className="ml-1.5 font-normal text-muted">{hint}</span>
      </span>
      {fillerCount > 2 && (
        <span className="text-muted">
          {fillerCount} filler{fillerCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}
