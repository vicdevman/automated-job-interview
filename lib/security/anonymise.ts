import 'server-only';
import { createHmac } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * PRD §8.3 — the interviewer console shows pseudonyms by default.
 *
 * The pseudonym is a keyed hash of the user id, so it is stable across
 * sessions (the interviewer can say "Candidate #A7F3 improved") but cannot be
 * reversed into an identity without the server key.
 */
export function pseudonymFor(userId: string): string {
  const digest = createHmac('sha256', env.AUTH_SECRET).update(userId).digest('hex');
  return `Candidate #${digest.slice(0, 4).toUpperCase()}`;
}

/** Redacts obvious direct identifiers from a string for anonymised display. */
export function redactIdentifiers(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]');
}
