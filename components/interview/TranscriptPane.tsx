'use client';

import { useEffect, useRef } from 'react';

/**
 * PRD §11.3 — confirmed text in full contrast, in-progress text in grey.
 *
 * The distinction matters: a candidate watching their words appear needs to
 * know which of them the system has actually committed to, especially on a poor
 * connection where partials churn.
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [finals, partial]);

  const empty = finals.length === 0 && !partial;

  return (
    <div
      className="max-h-52 overflow-y-auto rounded-xl border border-line bg-raised px-5 py-4"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Your answer as we hear it"
    >
      {empty ? (
        <p className="text-sm text-muted">{placeholder}</p>
      ) : (
        <p className="text-base leading-relaxed">
          <span>{finals.join(' ')}</span>
          {partial && <span className="text-muted"> {partial}</span>}
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.15em] animate-pulse bg-accent"
          />
          <span ref={endRef} />
        </p>
      )}
    </div>
  );
}
