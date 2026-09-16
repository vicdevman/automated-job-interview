import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Sign in</h1>
      <p className="mt-2 text-sm text-muted">Pick up where you left off.</p>
      <div className="mt-8">
        {/* LoginForm reads ?callbackUrl through useSearchParams, which opts the
            page into client-side rendering and needs a boundary to prerender. */}
        <Suspense fallback={<FormSkeleton />}>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-6 text-sm text-muted">
        No account yet?{' '}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Create one
        </Link>
      </p>
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
