'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/profile', label: 'Your background' },
  { href: '/setup', label: 'New interview' },
  { href: '/account', label: 'Your data' },
];

export function AppNav({ name, role }: { name: string; role: 'candidate' | 'interviewer' }) {
  const pathname = usePathname();
  const links = role === 'interviewer' ? [{ href: '/interviewer/sessions', label: 'Sessions' }, ...LINKS] : LINKS;

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-6 py-3.5">
        <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
          Interview Simulator
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm transition-colors',
                  active ? 'bg-raised font-medium text-text' : 'text-muted hover:text-text',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-sm text-muted sm:inline">{name}</span>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: '/' })}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
