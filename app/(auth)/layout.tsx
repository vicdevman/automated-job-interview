import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Logo } from '@/components/ui/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col relative z-5">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line/0 bg-surface/80 px-4 py-4 backdrop-blur-md sm:px-6 sm:py-5">
        <Link href="/" className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight">
          <Logo />
          Interview Simulator
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
