import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * PRD §8.1 — field-level encryption at rest.
 *
 * CV raw text, extracted facts and turn transcripts are AES-256-GCM encrypted
 * before they reach MongoDB. Repositories call these helpers, so no route
 * handler ever touches ciphertext directly.
 *
 * Envelope format (versioned so the key can be rotated later without a
 * migration guess):  v1.<iv-b64>.<tag-b64>.<ciphertext-b64>
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = Buffer.from(env.ENCRYPTION_KEY, 'base64');
  if (raw.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM.');
  }
  cachedKey = raw;
  return raw;
}

/** An encrypted field as stored in MongoDB. */
export type EncryptedField = string;

export function encryptField(plaintext: string): EncryptedField {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(
    '.',
  );
}

export function decryptField(envelope: EncryptedField): string {
  const parts = envelope.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Cannot decrypt: value is not a v1 AES-256-GCM envelope.');
  }
  const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Cannot decrypt: malformed envelope header.');
  }
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  // .final() throws if the tag does not verify — tampering is detected, not ignored.
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Tolerant read path: legacy plaintext rows survive a decrypt attempt. */
export function decryptFieldSafe(value: string | null | undefined): string {
  if (!value) return '';
  if (!value.startsWith(`${VERSION}.`)) return value;
  try {
    return decryptField(value);
  } catch {
    return '';
  }
}

export function isEncrypted(value: unknown): value is EncryptedField {
  return typeof value === 'string' && value.startsWith(`${VERSION}.`) && value.split('.').length === 4;
}

/** Constant-time compare, for anything secret that is checked rather than decrypted. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
