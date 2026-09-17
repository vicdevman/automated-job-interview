import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export const metadata: Metadata = { title: 'Privacy' };

/**
 * PRD §8.5 — "Ship a short privacy policy page stating them."
 *
 * Written to be read, not to be defensible in court: short sentences, no
 * "we may", no paragraph of definitions before the first fact.
 */
export default function PrivacyPage() {
  return (
    <div className="flex min-h-dvh flex-col relative z-5">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Interview Simulator
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Privacy</h1>
        <p className="mt-3 leading-relaxed text-muted">
          This states plainly what this system does with your information. It is written to comply
          with the Nigeria Data Protection Act 2023 and with GDPR principles.
        </p>

        <Section title="Your voice is never recorded">
          <p>
            While you answer a question, your microphone audio is streamed directly from your
            browser to a speech-recognition service, converted to text, and discarded. It does not
            pass through our servers and it is not written to disk anywhere. Only the resulting
            text is kept.
          </p>
          <p>
            This is the strongest privacy property this system has, so it is stated first.
          </p>
        </Section>

        <Section title="What is stored">
          <ul className="flex flex-col gap-2">
            <Bullet>Your name, email address and a hashed password.</Bullet>
            <Bullet>Any CV, link or summary you supply, as text.</Bullet>
            <Bullet>The facts extracted from those documents, which you review and confirm.</Bullet>
            <Bullet>
              The text of your interview answers, the scores given, and the feedback produced.
            </Bullet>
          </ul>
          <p>
            Your CV text, the extracted facts and your interview transcripts are encrypted with
            AES-256-GCM before being written to the database. Someone with direct database access
            sees ciphertext, not your words.
          </p>
        </Section>

        <Section title="Why we are allowed to hold it">
          <p>
            Consent. You tick a box before an interview begins, having been told what is captured.
            That consent is timestamped and versioned, so we can always show which wording you
            agreed to. You can withdraw it by deleting your data, which takes effect immediately.
          </p>
        </Section>

        <Section title="Who it is shared with">
          <ul className="flex flex-col gap-2">
            <Bullet>
              A speech-recognition provider, which receives your audio in order to transcribe it.
            </Bullet>
            <Bullet>
              A language-model provider, which receives your answers in order to score them. Your
              answers are not used to train it.
            </Bullet>
            <Bullet>
              An interviewer administering this system, who sees your results under a pseudonym
              such as “Candidate #A7F3”. Revealing your real identity is a deliberate action that is
              permanently recorded in an audit log.
            </Bullet>
          </ul>
          <p>It is not sold, and it is not shared with anyone else.</p>
        </Section>

        <Section title="How long it is kept">
          <p>
            Interview transcripts and uploaded documents are deleted automatically 90 days after
            the interview. Your scores remain after that, so you keep a record of having practised,
            but the words behind them are gone.
          </p>
        </Section>

        <Section title="What you can do">
          <ul className="flex flex-col gap-2">
            <Bullet>
              <strong className="font-medium text-text">See everything.</strong> Download a
              complete, readable copy of your data at any time.
            </Bullet>
            <Bullet>
              <strong className="font-medium text-text">Correct it.</strong> Edit or delete any fact
              extracted from your CV before it is ever used.
            </Bullet>
            <Bullet>
              <strong className="font-medium text-text">Erase it.</strong> Delete your account and
              everything attached to it, immediately and permanently.
            </Bullet>
          </ul>
          <p>
            All three are in{' '}
            <Link href="/account" className="text-accent underline-offset-4 hover:underline">
              Your data
            </Link>
            .
          </p>
        </Section>

        <Section title="Security">
          <p>
            Everything travels over TLS. API keys live only on the server. The single credential
            that reaches your browser is a transcription token scoped to speech recognition, valid
            for five minutes. Passwords are hashed with argon2id.
          </p>
        </Section>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-4 py-8 text-xs text-muted sm:px-6">
        This is a final-year academic project, not a commercial service.
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-line pt-8">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden="true" className="mt-2.5 size-1 shrink-0 rounded-full bg-muted" />
      <span>{children}</span>
    </li>
  );
}
