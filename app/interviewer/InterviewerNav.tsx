'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Logo } from '@/components/ui/Logo';
import { HeaderNotch } from '@/components/ui/HeaderNotch';
import { useAutoHideHeader } from '@/lib/hooks/useAutoHideHeader';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/interviewer/sessions', label: 'Sessions' },
  { href: '/interviewer/roles', label: 'Roles' },
  { href: '/interviewer/audit', label: 'Audit log' },
];

/** Owns the whole header (not just the nav links) so it can be sticky and auto-hide, matching AppNav. */
export function InterviewerNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { hidden, reveal } = useAutoHideHeader();

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

  // Collapsing max-height, not a translateY slide — see the note in AppNav.
  const headerMaxH = open ? 'max-h-[24rem]' : hidden ? 'max-h-0' : 'max-h-20 sm:max-h-24';

  return (
    <>
      <HeaderNotch visible={hidden && !open} onReveal={reveal} />
      <header
        className={cn(
          'sticky top-0 z-40 overflow-hidden border-b bg-surface/85 backdrop-blur-md',
          'transition-[max-height] duration-300 ease-out',
          headerMaxH,
          hidden && !open ? 'border-transparent' : 'border-line',
        )}
      >
        <div className="relative mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6 sm:py-3.5">
          <Link
            href="/interviewer/sessions"
            className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <Logo />
            <span className="hidden sm:inline">Interviewer console</span>
            <span className="sm:hidden">Console</span>
          </Link>

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
        </div>
      </header>
    </>
  );
}
