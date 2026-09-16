import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/**
 * PRD §11.1 — composed and quiet, one focal point. The landing page makes a
 * single claim (questions grounded in your real CV) and offers one action.
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold tracking-tight">
          <Logo />
          <span className="truncate">Interview Simulator</span>
        </span>
        <nav className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <Link
            href="/login"
            className="rounded-lg px-2 py-2 text-sm font-medium text-muted transition-colors hover:text-text sm:px-3"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="whitespace-nowrap rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-[filter] hover:brightness-110 sm:px-3.5"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
        <p className="mb-5 text-sm font-medium text-accent">Practise out loud, not on paper</p>

        <h1 className="max-w-3xl text-balance text-[2rem] font-semibold leading-[1.1] tracking-tight sm:text-[2.5rem] md:text-5xl">
          A mock interview that has actually read your CV.
        </h1>

        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:mt-6 sm:text-lg">
          Upload your CV, pick a role, and hold a real spoken conversation with an interviewer that
          asks about the work you have genuinely done. It listens while you answer, adapts the next
          question to what you just said, and hands back a breakdown of how you performed.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/register"
            className="inline-flex h-12 items-center rounded-lg bg-accent px-6 text-base font-medium text-white transition-[filter] hover:brightness-110"
          >
            Start an interview
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center rounded-lg border border-line px-6 text-base font-medium text-text transition-colors hover:border-muted/60"
          >
            I have an account
          </Link>
        </div>

        <ul className="mt-14 grid gap-8 border-t border-line pt-10 sm:mt-20 sm:gap-10 sm:grid-cols-3">
          <Claim title="Grounded in evidence">
            Every personalised question traces back to a verbatim line in your CV. Nothing is
            invented — if it was not in your documents, you will not be asked about it.
          </Claim>
          <Claim title="A conversation, not a form">
            The interviewer speaks and listens in real time. Talk over it and it stops, the way a
            person would.
          </Claim>
          <Claim title="Your audio is never stored">
            Speech streams straight to transcription and is discarded. Only the transcript is kept,
            encrypted, and you can delete all of it at any time.
          </Claim>
        </ul>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 py-8 text-xs text-muted sm:px-6">
        Built for final-year project defence · Data handled under NDPA 2023 and GDPR principles
      </footer>
    </div>
  );
}

function Claim({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
    </li>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 text-accent" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <path
        d="M8 10v4M12 7v10M16 10v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
