'use client';

import { useEffect, useState } from 'react';

/**
 * A plain call-timer readout — mm:ss counting up from when the interview
 * screen was opened, the way a phone call shows how long you've been on it.
 * Lives in the status rail, next to "Q3/6"; nothing fancier than that is
 * needed here, so it stays a single small ticking component rather than
 * threading "how long has this been running" state through useInterview.
 */
export function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsedSec, setElapsedSec] = useState(() => Math.floor((Date.now() - startedAt) / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  const label = `${mins}:${String(secs).padStart(2, '0')}`;

  return (
    <span className="shrink-0 tabular-nums text-muted" aria-label={`${mins} minutes ${secs} seconds elapsed`}>
      {label}
    </span>
  );
}
