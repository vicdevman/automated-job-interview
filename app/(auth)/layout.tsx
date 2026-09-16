import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <Link href="/" className="text-sm font-semibold tracking-tight">
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
