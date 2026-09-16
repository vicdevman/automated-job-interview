import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { authConfig } from './auth.config';
import { findUserByEmail } from '@/lib/db/repositories/users';
import { verifyPassword } from '@/lib/security/password';

/**
 * PRD §8.2 — email/password only, two roles, no public interviewer signup.
 * Sessions are JWT rather than database-backed, which is what the credentials
 * provider supports and what keeps middleware off the database.
 */

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await findUserByEmail(parsed.data.email);
        if (!user) return null;

        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user._id.toHexString(),
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});
