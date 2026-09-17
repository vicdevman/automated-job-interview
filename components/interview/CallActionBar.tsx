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
       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4.5">
  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 3.75 18 6m0 0 2.25 2.25M18 6l2.25-2.25M18 6l-2.25 2.25m1.5 13.5c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 0 1 4.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a1.062 1.062 0 0 0-.38 1.21 12.035 12.035 0 0 0 7.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 0 1 1.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 0 1-2.25 2.25h-2.25Z" />
</svg>

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
          'relative grid cursor-pointer place-items-center rounded-full transition-[background-color,color,transform,opacity] duration-150',
          size === 'lg' ? 'size-14' : 'size-11',
          tone === 'accent' && 'bg-accent text-white hover:brightness-110 active:scale-95',
          tone === 'danger' &&
            'bg-red-500/20 text-red-500 hover:brightness-110 active:scale-95',
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
