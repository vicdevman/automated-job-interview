'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * PRD §11.3 — confirmed text in full contrast, in-progress text in grey.
 *
 * The distinction matters: a candidate watching their words appear needs to
 * know which of them the system has actually committed to, especially on a poor
 * connection where partials churn.
 *
 * The box is kept deliberately short by default so it doesn't dominate the
 * screen, with a small expand toggle for anyone giving a longer answer who
 * wants to see more of it at once, and a fade at the bottom edge so a short
 * box never looks like it simply stops mid-sentence.
 */
export function TranscriptPane({
  finals,
  partial,
  placeholder,
}: {
  finals: string[];
  partial: string;
  placeholder: string;
}) {
  const endRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [finals, partial]);

  const empty = finals.length === 0 && !partial;

  return (
    <div className="relative">
      <div
        className={`overflow-y-auto rounded-xl border border-line bg-raised px-4 py-3.5 pr-11 transition-[max-height] duration-300 ease-out sm:px-5 sm:py-4 ${
          expanded ? 'max-h-64 sm:max-h-80' : 'max-h-28 sm:max-h-36'
        }`}
        aria-live="polite"
        aria-atomic="false"
        aria-label="Your answer as we hear it"
      >
        {empty ? (
          <p className="text-sm text-muted">{placeholder}</p>
        ) : (
          <p className="text-sm leading-relaxed sm:text-base">
            <span>{finals.join(' ')}</span>
            {partial && <span className="text-muted"> {partial}</span>}
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.15em] animate-pulse bg-accent"
            />
          </p>
        )}
        <span ref={endRef} />
      </div>

      {/* Fade at the bottom edge — a visual cue that the box can hold (and
          scroll to) more than what's currently visible, not a hard cutoff. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-xl bg-gradient-to-t from-raised to-transparent"
      />

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? 'Shrink the answer box' : 'Expand the answer box'}
        aria-expanded={expanded}
        className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-surface/70 text-muted backdrop-blur-sm transition-colors hover:text-text"
      >
        <svg
          viewBox="0 0 24 24"
          className={`size-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}
