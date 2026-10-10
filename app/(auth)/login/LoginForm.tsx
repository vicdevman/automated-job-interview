'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession, signIn } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { roleHome } from '@/lib/auth/roleHome';

type DemoAccount = { label: string; email: string; password: string };

export function LoginForm({ demoAccounts = [] }: { demoAccounts?: DemoAccount[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Controlled so a demo-account button can fill them without touching the
  // DOM directly; everything else about the form stays FormData-based.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function fillDemoAccount(account: DemoAccount) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await signIn('credentials', {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      redirect: false,
    });

    setPending(false);

    if (!result || result.error) {
      // Deliberately not "no such user" vs "wrong password" — that difference
      // tells an attacker which emails are registered.
      setError('Those details did not match an account.');
      return;
    }

    // signIn's own result carries no role, so the callback-less path needs a
    // fresh session read — otherwise an interviewer always landed on the
    // candidate dashboard (and its "Start an interview" prompt) and had to
    // find Sessions themselves instead of arriving there directly.
    const callbackUrl = params.get('callbackUrl');
    if (callbackUrl) {
      router.push(callbackUrl);
    } else {
      const freshSession = await getSession();
      router.push(roleHome(freshSession?.user?.role));
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {demoAccounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {demoAccounts.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => fillDemoAccount(account)}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
            >
              Use {account.label}
            </button>
          ))}
        </div>
      )}
      <Input
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="md" loading={pending} className="mt-2">
        Sign in
      </Button>
    </form>
  );
}
