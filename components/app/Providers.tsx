'use client';

import { SessionProvider } from 'next-auth/react';
import { CallHeaderProvider } from '@/lib/hooks/useCallHeader';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CallHeaderProvider>{children}</CallHeaderProvider>
    </SessionProvider>
  );
}
