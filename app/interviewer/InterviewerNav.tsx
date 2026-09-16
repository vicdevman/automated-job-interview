'use client';

import { useEffect, useState } from 'react';
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

/** Same collapse behaviour as the candidate nav — see AppNav. */
export function InterviewerNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <nav className="hidden items-center gap-1 sm:flex">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              pathname.startsWith(link.href)
                ? 'bg-raised font-medium text-text'
                : 'text-muted hover:text-text',
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: '/' })}
          className="hidden rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-text sm:block"
        >
          Sign out
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="interviewer-mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-text sm:hidden"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            {open ? (
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          id="interviewer-mobile-menu"
          aria-label="Interviewer"
          className="absolute inset-x-0 top-full z-40 border-b border-line bg-raised px-4 py-2 sm:hidden"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'block rounded-lg px-3 py-2.5 text-sm transition-colors',
                pathname.startsWith(link.href) ? 'font-medium text-accent' : 'text-text',
              )}
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: '/' })}
            className="mt-2 block w-full border-t border-line px-3 pb-1 pt-3 text-left text-sm text-muted"
          >
            Sign out
          </button>
        </nav>
      )}
    </>
  );
}
