import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = { title: 'Create an account' };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Create an account</h1>
      <p className="mt-2 text-sm text-muted">
        You will be able to upload a CV and start an interview straight away.
      </p>
      <div className="mt-8">
        <RegisterForm />
      </div>
      <p className="mt-6 text-sm text-muted">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
