import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { env } from '@/lib/env';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  // Demo-account quick-fill, purely so this project can be shown off without
  // anyone having to remember or share real credentials. Each entry only
  // appears if the matching pair of env vars is actually set, so a real
  // deployment with no seeded demo accounts shows nothing here.
  const demoAccounts = [
    env.SEED_INTERVIEWER_EMAIL && env.SEED_INTERVIEWER_PASSWORD
      ? { label: 'Admin (interviewer)', email: env.SEED_INTERVIEWER_EMAIL, password: env.SEED_INTERVIEWER_PASSWORD }
      : null,
    env.SEED_DEMO_CANDIDATE_EMAIL && env.SEED_DEMO_CANDIDATE_PASSWORD
      ? { label: 'Regular user', email: env.SEED_DEMO_CANDIDATE_EMAIL, password: env.SEED_DEMO_CANDIDATE_PASSWORD }
      : null,
  ].filter((a): a is { label: string; email: string; password: string } => a !== null);

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight sm:text-[1.75rem]">Sign in</h1>
      <p className="mt-2 text-sm text-muted">Pick up where you left off.</p>

      

      <div className="mt-8">
        {/* LoginForm reads ?callbackUrl through useSearchParams, which opts the
            page into client-side rendering and needs a boundary to prerender. */}
        <Suspense fallback={<FormSkeleton />}>
          <LoginForm demoAccounts={demoAccounts} />
        </Suspense>
      </div>
      <p className="mt-6 text-sm text-muted">
        No account yet?{' '}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Create one
        </Link>
      </p>

      {demoAccounts.length > 0 && (
        <div className="mt-6 rounded-xl border border-line bg-raised p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Demo accounts</p>
          <ul className="mt-3 flex flex-col gap-2">
            {demoAccounts.map((account) => (
              <li
                key={account.email}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2"
              >
                <span className="text-sm">
                  <span className="font-medium">{account.label}</span>{' '}
                  <span className="text-muted"> <br /> <strong>Email:</strong> {account.email} <br /><strong>Password: </strong> {account.password}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="h-[68px] rounded-lg border border-line bg-raised" />
      <div className="h-[68px] rounded-lg border border-line bg-raised" />
      <div className="mt-2 h-12 rounded-lg bg-line" />
    </div>
  );
}
