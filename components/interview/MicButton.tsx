'use client';

import { cn } from '@/lib/cn';
import type { InterviewState } from '@/lib/interview/useInterview';

/**
 * The manual override. PRD §6.2 and §6.3 both require one: a button to stop the
 * interviewer talking, and a button to declare the answer finished. Which of
 * those it is depends on whose turn it is, so it is one control, not two.
 */
export function MicButton({
  state,
  level,
  disabled,
  onBargeIn,
  onDone,
}: {
  state: InterviewState;
  level: number;
  disabled?: boolean;
  onBargeIn: () => void;
  onDone: () => void;
}) {
  const speaking = state === 'speaking';
  const listening = state === 'listening';
  const usable = (speaking || listening) && !disabled;

  const label = speaking
    ? 'Interrupt and answer now'
    : listening
      ? 'Done answering'
      : 'Wait';

  return (
    <button
      type="button"
      onClick={speaking ? onBargeIn : onDone}
      disabled={!usable}
      aria-label={label}
      className={cn(
        'relative inline-flex h-12 items-center gap-2.5 rounded-full px-6 text-sm font-medium',
        'transition-[background-color,color,opacity] duration-150',
        listening && 'bg-accent text-white hover:brightness-110',
        speaking && 'border border-line text-muted hover:border-muted/60 hover:text-text',
        !usable && 'cursor-not-allowed border border-line text-muted/60',
      )}
    >
      {listening && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-accent/40"
          style={{
            transform: `scale(${1 + Math.min(0.18, level * 2.2)})`,
            opacity: Math.min(0.9, 0.25 + level * 5),
            transition: 'transform 90ms linear, opacity 90ms linear',
          }}
        />
      )}
      <span className="relative">{label}</span>
    </button>
  );
}
