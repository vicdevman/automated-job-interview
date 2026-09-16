import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AppNav } from '@/components/app/AppNav';
import { Providers } from '@/components/app/Providers';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <Providers>
      <div className="flex min-h-dvh flex-col">
        <AppNav name={session.user.name ?? 'You'} role={session.user.role} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
      </div>
    </Providers>
  );
}
