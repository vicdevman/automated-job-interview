import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: { id: string; role: 'candidate' | 'interviewer' } & DefaultSession['user'];
  }
  interface User {
    role: 'candidate' | 'interviewer';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: 'candidate' | 'interviewer';
  }
}
