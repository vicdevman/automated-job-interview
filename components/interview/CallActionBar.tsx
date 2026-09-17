'use client';

import { cn } from '@/lib/cn';
import type { InterviewState } from '@/lib/interview/useInterview';
import { CheckIcon, HangUpIcon, KeyboardIcon, MicIcon } from './CallIcons';

/**
 * The floating, iOS-in-call-style control row. Three circular buttons:
 * keyboard (switch to typing) on the left, the primary action in the centre
 * (mic while listening → checkmark to submit; a plain mic while the
 * interviewer is speaking → tap to interrupt), and a red hang-up on the
 * right that opens the end-interview confirmation — the same shape and
 * colour as a real "decline call" button, so what it does is legible before
 * anyone reads a label.
 */
export function CallActionBar({
  state,
  level,
  typing,
  disabled,
  toggleDisabled,
  onToggleTyping,
  onBargeIn,
  onDone,
  onEndCall,
}: {
  state: InterviewState;
  level: number;
  typing: boolean;
  disabled?: boolean;
  /** True when voice is unavailable, so switching OUT of typing would be a dead end. */
  toggleDisabled?: boolean;
  onToggleTyping: () => void;
  onBargeIn: () => void;
  onDone: () => void;
  onEndCall: () => void;
}) {
  const speaking = state === 'speaking';
  const listening = state === 'listening';
  const primaryUsable = (speaking || listening) && !disabled && !typing;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex items-center gap-5 rounded-full border border-line/70 bg-raised/90 px-2 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:gap-6 sm:px-2">
        {/* keyboard / voice toggle */}
        <CallButton
          onClick={onToggleTyping}
          disabled={typing && toggleDisabled}
          label={typing ? 'Voice' : 'Type'}
          tone="neutral"
          size="sm"
          active={typing}
        >
          {typing ? <MicIcon className="size-4.5" /> : <KeyboardIcon className="size-4.5" />}
        </CallButton>

        {/* primary action */}
        <CallButton
          onClick={speaking ? onBargeIn : onDone}
          disabled={!primaryUsable}
          label={speaking ? 'Interrupt' : 'Done'}
          tone={listening ? 'accent' : 'neutral'}
          size="sm"
          pulseLevel={listening ? level : 0}
        >
          {listening ? <CheckIcon className="size-6" /> : <MicIcon className="size-5" />}
        </CallButton>

        {/* end call */}
        <CallButton onClick={onEndCall} label="End" tone="danger" size="sm">
          <HangUpIcon className="size-4.5" />
        </CallButton>
      </div>
    </div>
  );
}

function CallButton({
  onClick,
  disabled,
  label,
  tone,
  size,
  active,
  pulseLevel = 0,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  tone: 'accent' | 'neutral' | 'danger';
  size: 'sm' | 'lg';
  active?: boolean;
  pulseLevel?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cn(
          'relative grid place-items-center rounded-full transition-[background-color,color,transform,opacity] duration-150',
          size === 'lg' ? 'size-14' : 'size-11',
          tone === 'accent' && 'bg-accent text-white hover:brightness-110 active:scale-95',
          tone === 'danger' &&
            'bg-danger text-white hover:brightness-110 active:scale-95',
          tone === 'neutral' &&
            (active
              ? 'bg-accent-soft text-accent'
              : 'border border-line text-muted hover:border-muted/60 hover:text-text active:scale-95'),
          disabled && 'cursor-not-allowed opacity-40 active:scale-100',
        )}
      >
        {tone === 'accent' && pulseLevel > 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full bg-white/25"
            style={{
              transform: `scale(${1 + Math.min(0.35, pulseLevel * 3)})`,
              opacity: Math.min(0.6, pulseLevel * 4),
              transition: 'transform 90ms linear, opacity 90ms linear',
            }}
          />
        )}
        <span className="relative">{children}</span>
      </button>
      {/* <span className="text-[11px] font-medium text-muted">{label}</span> */}
    </div>
  );
}
