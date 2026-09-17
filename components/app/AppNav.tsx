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
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/profile', label: 'Your background' },
  { href: '/setup', label: 'New interview' },
  { href: '/account', label: 'Your data' },
];

/**
 * Five links plus a name, a theme toggle and a sign-out button do not fit on a
 * 375px screen, so below `sm` they collapse behind a menu button. The logo and
 * the theme toggle stay visible at every width because they are the two things
 * someone reaches for without thinking.
 */
export function AppNav({ name, role }: { name: string; role: 'candidate' | 'interviewer' }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // "On a call": the interview screen has its own sticky status header (see
  // InterviewScreen), so the app header defaults to hidden there — whether
  // scrolled or not — with only the notch showing, same as a real call UI.
  const isCallRoute = pathname.startsWith('/interview/');
  const { hidden, reveal } = useAutoHideHeader({ forceHidden: isCallRoute });

  const links =
    role === 'interviewer'
      ? [{ href: '/interviewer/sessions', label: 'Sessions' }, ...LINKS]
      : LINKS;

  // Navigating should always close the menu, including on a link to the page
  // you are already on.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // An open menu is a modal-ish surface; let Escape dismiss it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // A collapsing max-height rather than a translateY slide: translating a
  // sticky element off-screen still reserves its box in the flow, which left
  // a dead gap of blank space at the top of every page whenever the header
  // was "hidden" — the actual bug behind the reported layout mess. Collapsing
  // the height to 0 makes the space genuinely disappear, so whatever is below
  // (the interview's own status header, the page content) sits flush at the
  // top with nothing in between.
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
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6 sm:py-3.5">
        <Link href="/dashboard" className="shrink-0 text-sm font-semibold tracking-tight flex min-w-0 items-center gap-2">
          {/* The full name is too wide next to a menu button on a small screen. */}
          <Logo/>
          <span className="hidden sm:inline">Interview Simulator</span>
          <span className="sm:hidden">Interview Sim</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm transition-colors',
                isActive(link.href)
                  ? 'bg-raised font-medium text-text'
                  : 'text-muted hover:text-text',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span className="hidden text-sm text-muted lg:inline">{name}</span>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: '/' })}
            className="hidden rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-text md:block"
          >
            Sign out
          </button>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="app-mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-text md:hidden"
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="app-mobile-menu"
          className="border-t border-line bg-raised md:hidden"
          aria-label="Main"
        >
          <div className="mx-auto w-full max-w-5xl px-4 py-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'block rounded-lg px-3 py-2.5 text-sm transition-colors',
                  isActive(link.href) ? 'font-medium text-accent' : 'text-text',
                )}
              >
                {link.label}
              </Link>
            ))}

            <div className="mt-2 flex items-center justify-between border-t border-line px-3 pb-1 pt-3">
              <span className="truncate text-sm text-muted">{name}</span>
              <button
                type="button"
                onClick={() => void signOut({ callbackUrl: '/' })}
                className="shrink-0 text-sm text-muted transition-colors hover:text-text"
              >
                Sign out
              </button>
            </div>
          </div>
        </nav>
      )}
      </header>
    </>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
