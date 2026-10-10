import type { NextAuthConfig } from 'next-auth';
import { roleHome } from '@/lib/auth/roleHome';

/**
 * Edge-safe half of the auth configuration. No database access and no Node-only
 * crypto, so middleware can import it. The credentials provider and its argon2
 * verification live in auth.ts, which runs on the Node runtime.
 */

const CANDIDATE_PREFIXES = ['/dashboard', '/profile', '/setup', '/interview', '/results', '/dev'];
const INTERVIEWER_PREFIX = '/interviewer';

export const authConfig = {
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 },
  pages: { signIn: '/login', error: '/login' },
  providers: [],
  callbacks: {
    /** Route protection. Runs in middleware, so it must stay database-free. */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const user = auth?.user;

      const needsCandidate = CANDIDATE_PREFIXES.some((p) => pathname.startsWith(p));
      const needsInterviewer = pathname.startsWith(INTERVIEWER_PREFIX);

      if (needsInterviewer) return user?.role === 'interviewer';
      if (needsCandidate) return Boolean(user);

      // Signed-in users have no reason to see the auth screens again.
      if (user && (pathname === '/login' || pathname === '/register')) {
        return Response.redirect(new URL(roleHome(user.role), request.nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: 'candidate' | 'interviewer' }).role ?? 'candidate';
        token.name = user.name ?? token.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.role = (token.role as 'candidate' | 'interviewer' | undefined) ?? 'candidate';
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
