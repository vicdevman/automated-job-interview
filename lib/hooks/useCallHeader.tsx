'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The "in a call" app-header behaviour: on the interview screen the main app
 * header (AppNav) stays hidden by default — no notch, no scroll tricks — and
 * is only shown when the call's own status bar toggle is tapped. Living here
 * as a context (not a prop) because AppNav and the call's status bar are
 * siblings in the tree (AppNav from the layout, the status bar from the page
 * content), not parent/child.
 */
type CallHeaderContextValue = {
  isCallRoute: boolean;
  visible: boolean;
  toggle: () => void;
};

const CallHeaderContext = createContext<CallHeaderContextValue | null>(null);

export function CallHeaderProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCallRoute = pathname.startsWith('/interview/');
  const [visible, setVisible] = useState(false);

  // Each new call starts with the app header hidden, regardless of whether a
  // previous call left it toggled open.
  useEffect(() => {
    setVisible(false);
  }, [isCallRoute]);

  const toggle = useCallback(() => setVisible((v) => !v), []);

  return (
    <CallHeaderContext.Provider value={{ isCallRoute, visible, toggle }}>
      {children}
    </CallHeaderContext.Provider>
  );
}

export function useCallHeader() {
  const ctx = useContext(CallHeaderContext);
  if (!ctx) throw new Error('useCallHeader must be used within CallHeaderProvider');
  return ctx;
}
