'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The "in a call" header behaviour: sticky at the top, slides away when the
 * page is scrolled down, and reappears the moment the page is scrolled back
 * up even slightly (never makes someone scroll all the way to the top to get
 * the nav back). A small notch/pull-tab is shown by the caller while hidden
 * so the header is never truly unreachable.
 *
 * Deliberately tiny and dependency-free — this is UI chrome, not app state.
 */
export function useAutoHideHeader(revealThresholdPx = 8) {
  const [hidden, setHidden] = useState(false);
  const lastYRef = useRef(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    lastYRef.current = window.scrollY;

    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;

      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastYRef.current;

        // Always visible near the top — hiding immediately on a page that
        // barely scrolls would feel broken, not sleek.
        if (y < 64) {
          setHidden(false);
        } else if (delta > revealThresholdPx) {
          setHidden(true);
        } else if (delta < -revealThresholdPx) {
          setHidden(false);
        }

        lastYRef.current = y;
        tickingRef.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [revealThresholdPx]);

  return { hidden, reveal: () => setHidden(false) };
}
