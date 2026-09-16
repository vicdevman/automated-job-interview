import Link from 'next/link';
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
        <header className="border-b border-line">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3.5">
            <Link href="/interviewer/sessions" className="text-sm font-semibold tracking-tight">
              Interviewer console
            </Link>
            <InterviewerNav />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
      </div>
    </Providers>
  );
}
