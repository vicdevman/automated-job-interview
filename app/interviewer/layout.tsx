import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Providers } from '@/components/app/Providers';
import { InterviewerNav } from './InterviewerNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PRD §1.2 — the interviewer console. Guarded here as well as in middleware:
 * middleware protects the route, this protects the data even if the matcher
 * is ever changed.
 */
export default async function InterviewerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'interviewer') redirect('/dashboard');

  return (
    <Providers>
      <div className="flex min-h-dvh flex-col">
        <InterviewerNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      </div>
    </Providers>
  );
}
