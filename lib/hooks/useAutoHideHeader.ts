'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The "in a call" header behaviour: sticky at the top, slides away when the
 * page is scrolled down, and reappears the moment the page is scrolled back
 * up even slightly (never makes someone scroll all the way to the top to get
 * the nav back). A small notch/pull-tab is shown by the caller while hidden
 * so the header is never truly unreachable.
 *
 * `forceHidden` is the "on a call" mode: the header stays hidden by default
 * regardless of scroll position — even sitting at the very top of the page —
 * and only the notch is shown. Tapping the notch still reveals it (in case
 * someone needs to sign out or navigate away mid-interview); that manual
 * reveal is remembered until `forceHidden` itself changes (e.g. leaving the
 * interview route), not re-hidden by scrolling.
 *
 * Deliberately tiny and dependency-free — this is UI chrome, not app state.
 */
export function useAutoHideHeader(options?: { revealThresholdPx?: number; forceHidden?: boolean }) {
  const revealThresholdPx = options?.revealThresholdPx ?? 8;
  const forceHidden = options?.forceHidden ?? false;

  const [scrollHidden, setScrollHidden] = useState(false);
  const [manualReveal, setManualReveal] = useState(false);
  const lastYRef = useRef(0);
  const tickingRef = useRef(false);

  // A route change (or any other flip of forceHidden) starts a fresh "call" —
  // any earlier manual reveal from a different context should not leak in.
  useEffect(() => {
    setManualReveal(false);
  }, [forceHidden]);

  useEffect(() => {
    if (forceHidden) return; // scroll no longer drives visibility in this mode
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
          setScrollHidden(false);
        } else if (delta > revealThresholdPx) {
          setScrollHidden(true);
        } else if (delta < -revealThresholdPx) {
          setScrollHidden(false);
        }

        lastYRef.current = y;
        tickingRef.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [forceHidden, revealThresholdPx]);

  const hidden = forceHidden ? !manualReveal : scrollHidden;

  const reveal = () => {
    if (forceHidden) setManualReveal(true);
    else setScrollHidden(false);
  };

  return { hidden, reveal };
}
