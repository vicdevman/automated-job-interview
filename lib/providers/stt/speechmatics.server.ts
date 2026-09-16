import 'server-only';
import type { SttIssuedToken, SttTokenIssuer } from './types';
import { ProviderError } from '../errors';
import { env, requireEnv } from '@/lib/env';

/**
 * PRD §3.1 — the server half of Speechmatics realtime.
 *
 * The real API key never leaves this process. It is exchanged for a short-lived
 * JWT which the browser then attaches to the WebSocket URL as a query
 * parameter, because browsers cannot set WebSocket headers.
 *
 *   POST https://mp.speechmatics.com/v1/api_keys?type=rt
 *   Authorization: Bearer <REAL_KEY>
 *   { "ttl": 60..86400 }
 *   → { "apikey_id": "...", "key_value": "eyJhbG..." }
 *
 * `client_ref` is ignored for `rt` tokens (it is batch-only), so it is not sent.
 */
export const speechmaticsIssuer: SttTokenIssuer = {
  id: 'speechmatics',
  mode: 'realtime',

  async issueToken({ ttlSeconds }): Promise<SttIssuedToken> {
    const apiKey = requireEnv('SPEECHMATICS_API_KEY');
    const ttl = Math.min(Math.max(Math.trunc(ttlSeconds), 60), 86_400);

    const response = await fetch(`${env.SPEECHMATICS_MP_URL}/api_keys?type=rt`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ProviderError('speechmatics', response.status, detail.slice(0, 300));
    }

    const body = (await response.json()) as { key_value?: string; apikey_id?: string };
    if (!body.key_value) {
      throw new ProviderError('speechmatics', 502, 'Token response contained no key_value.');
    }

    // The JWT rides as a query parameter — this is the provider's call to make,
    // which is exactly why wsUrl is returned rather than assembled by the client.
    const wsUrl = `${env.SPEECHMATICS_RT_URL}?jwt=${encodeURIComponent(body.key_value)}`;

    return {
      token: body.key_value,
      wsUrl,
      // Expire the token locally a little early so a session never starts on a
      // credential that dies mid-handshake.
      expiresAt: Date.now() + (ttl - 10) * 1000,
    };
  },
};
