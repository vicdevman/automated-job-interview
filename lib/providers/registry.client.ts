import type { SttRealtimeFactory } from './stt/types';
import { speechmaticsRealtime } from './stt/speechmatics.client';

/**
 * Browser-side half of the STT registry (PRD §3.2). Resolved from
 * NEXT_PUBLIC_STT_PROVIDER, which Next.js inlines at build time — so this must
 * be a literal property access, not a computed env lookup.
 */
const FACTORIES: Record<string, SttRealtimeFactory> = {
  speechmatics: speechmaticsRealtime,
};

export function sttFactory(): SttRealtimeFactory {
  const key = process.env.NEXT_PUBLIC_STT_PROVIDER ?? 'speechmatics';
  const chosen = FACTORIES[key];
  if (!chosen) {
    throw new Error(
      `Unknown client STT provider "${key}". Available: ${Object.keys(FACTORIES).join(', ')}`,
    );
  }
  return chosen;
}
