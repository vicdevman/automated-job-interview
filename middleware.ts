import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

/**
 * Only the edge-safe config is used here — the credentials provider never runs
 * in middleware, so no database driver is pulled into the edge bundle.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|webp|woff2)$).*)'],
};
