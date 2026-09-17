'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

    router.push(params.get('callbackUrl') ?? '/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Input
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />
      <Input
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
        placeholder="••••••••"
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
