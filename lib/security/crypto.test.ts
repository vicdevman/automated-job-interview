import { describe, it, expect, beforeAll } from 'vitest';

// The crypto module reads ENCRYPTION_KEY through lib/env at import time, so the
// environment has to be in place before the dynamic import below.
beforeAll(() => {
  process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017';
  process.env.AUTH_SECRET ??= 'test-secret-value-at-least-16';
});

async function crypto() {
  return import('./crypto');
}

describe('field encryption (PRD §8.1)', () => {
  it('round-trips a transcript', async () => {
    const { encryptField, decryptField } = await crypto();
    const plain = 'I once had a production issue where the database connections were exhausted.';
    expect(decryptField(encryptField(plain))).toBe(plain);
  });

  it('round-trips unicode and empty strings', async () => {
    const { encryptField, decryptField } = await crypto();
    for (const plain of ['', 'naïve café — 你好 🎧', 'a'.repeat(50_000)]) {
      expect(decryptField(encryptField(plain))).toBe(plain);
    }
  });

  it('produces different ciphertext each time (fresh IV)', async () => {
    const { encryptField } = await crypto();
    expect(encryptField('same input')).not.toBe(encryptField('same input'));
  });

  it('does not leak plaintext into the envelope', async () => {
    const { encryptField } = await crypto();
    const secret = 'Flutterwave payments migration';
    expect(encryptField(secret)).not.toContain('Flutterwave');
  });

  it('rejects a tampered ciphertext rather than returning garbage', async () => {
    const { encryptField, decryptField } = await crypto();
    const envelope = encryptField('original');
    const parts = envelope.split('.');
    const data = Buffer.from(parts[3]!, 'base64');
    data.writeUInt8(data.readUInt8(0) ^ 0xff, 0);
    parts[3] = data.toString('base64');
    expect(() => decryptField(parts.join('.'))).toThrow();
  });

  it('rejects a swapped authentication tag', async () => {
    const { encryptField, decryptField } = await crypto();
    const a = encryptField('message A').split('.');
    const b = encryptField('message B').split('.');
    a[2] = b[2]!;
    expect(() => decryptField(a.join('.'))).toThrow();
  });

  it('rejects a non-envelope value', async () => {
    const { decryptField } = await crypto();
    expect(() => decryptField('just some plaintext')).toThrow();
  });

  it('identifies envelopes', async () => {
    const { encryptField, isEncrypted } = await crypto();
    expect(isEncrypted(encryptField('x'))).toBe(true);
    expect(isEncrypted('x')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});
