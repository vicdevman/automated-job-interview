import 'server-only';
import { hash, verify } from '@node-rs/argon2';

/**
 * PRD §8.2 — argon2id. Parameters are the OWASP baseline: 19 MiB memory,
 * 2 iterations, 1 degree of parallelism. Comfortably above "bcrypt cost 12"
 * and it runs fine inside a Vercel function.
 *
 * The algorithm is given as its numeric value (Algorithm.Argon2id === 2)
 * because @node-rs/argon2 ships it as an ambient const enum, which
 * verbatimModuleSyntax cannot import.
 */
const ARGON2ID = 2;

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, plain, OPTIONS);
  } catch {
    // A malformed hash must read as "wrong password", never as a crash that
    // distinguishes a real account from a fake one.
    return false;
  }
}
