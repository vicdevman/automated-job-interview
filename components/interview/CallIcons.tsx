/**
 * Small, consistent icon set for the interview call bar — stroke-based,
 * matching the avatar and nav icons already in the app rather than pulling in
 * an icon library for six shapes.
 */

type IconProps = { className?: string };

export function MicIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function KeyboardIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M6.5 13.5h11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckIcon({ className = 'size-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The classic red hang-up glyph: a phone handset rotated to "decline". */
export function HangUpIcon({ className = 'size-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M3.5 13c5.5-4.6 11.5-4.6 17 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 13.6l-2.2 2.2a1.4 1.4 0 0 0 0 2l1 1a1.4 1.4 0 0 0 1.9.1c.8-.7 1.9-1 3.3-1s2.5.3 3.3 1a1.4 1.4 0 0 0 1.9-.1l1-1a1.4 1.4 0 0 0 0-2L16 13.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.12"
      />
    </svg>
  );
}

export function WaveformIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M4 12v1M8 9v6M12 5v14M16 9v6M20 12v1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ThinkingDotsIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.6" opacity="0.9" />
      <circle cx="12" cy="12" r="1.6" opacity="0.6" />
      <circle cx="18" cy="12" r="1.6" opacity="0.3" />
    </svg>
  );
}

export function FlagIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 21V4M12 4h6.5c.8 0 1.2.9.7 1.5L17 8l2.2 2.5c.5.6.1 1.5-.7 1.5H12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
