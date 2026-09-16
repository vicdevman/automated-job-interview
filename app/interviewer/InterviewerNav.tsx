'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/interviewer/sessions', label: 'Sessions' },
  { href: '/interviewer/roles', label: 'Roles' },
  { href: '/interviewer/audit', label: 'Audit log' },
];

export function InterviewerNav() {
  const pathname = usePathname();

  return (
    <>
      <nav className="flex items-center gap-1">
        {LINKS.map((link) => {
          const active = pathname.startsWith(link.href);
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
        <ThemeToggle />
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: '/' })}
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
        >
          Sign out
        </button>
      </div>
    </>
  );
}
