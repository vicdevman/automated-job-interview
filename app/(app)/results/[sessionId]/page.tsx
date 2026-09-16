import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { findSessionById } from '@/lib/db/repositories/sessions';
import { listTurns } from '@/lib/db/repositories/turns';
import { Badge } from '@/components/ui/Surface';
import { ScoreRadar } from './ScoreRadar';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Results' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const interview = await findSessionById(sessionId);
  if (!interview || interview.userId.toHexString() !== session.user.id) notFound();

  const turns = await listTurns(new ObjectId(sessionId));

  if (turns.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-[1.75rem] font-semibold tracking-tight">Nothing to report</h1>
        <p className="mt-3 leading-relaxed text-muted">
          This interview ended before any question was answered, so there is nothing to score.
        </p>
        <Link
          href="/setup"
          className="mt-8 inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white"
        >
          Start a new one
        </Link>
      </div>
    );
  }

  const score = interview.overallScore ?? 0;
  const sub = interview.subScores ?? { relevance: 0, clarity: 0, structure: 0, pace: 0 };
  const spokenTurns = turns.filter((t) => t.inputMode === 'voice');
  const typedCount = turns.length - spokenTurns.length;

  return (
    <>
      {/* ── header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-muted">
            {interview.roleTitle} · {interview.level} ·{' '}
            {interview.startedAt.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          <h1 className="mt-2 text-[1.75rem] font-semibold tracking-tight">How it went</h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[2.5rem] font-semibold leading-none tabular-nums">
              {Math.round(score)}
            </p>
            <p className="mt-1 text-xs text-muted">out of 100</p>
          </div>
          <a
            href={`/api/report/${sessionId}`}
            className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-muted/60"
          >
            Download PDF
          </a>
        </div>
      </div>

      {/* ── summary ──────────────────────────────────────────────────────── */}
      {interview.summary && (
        <p className="mt-8 max-w-3xl text-lg leading-relaxed">{interview.summary}</p>
      )}

      {/* ── breakdown ────────────────────────────────────────────────────── */}
      <section className="mt-12 grid gap-10 border-t border-line pt-10 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 className="text-lg font-medium">Where the marks came from</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Relevance is weighted most heavily at 40%, then clarity at 25%, structure at 20% and
            pace at 15%.
          </p>
          <ScoreRadar
            data={[
              { axis: 'Relevance', value: sub.relevance },
              { axis: 'Clarity', value: sub.clarity },
              { axis: 'Structure', value: sub.structure },
              { axis: 'Pace', value: sub.pace },
            ]}
          />
        </div>

        <div className="flex flex-col gap-8">
          {interview.strengths.length > 0 && (
            <div>
              <h2 className="text-lg font-medium text-positive">What worked</h2>
              <ul className="mt-3 flex flex-col gap-2.5">
                {interview.strengths.map((s) => (
                  <li key={s} className="flex gap-2.5 text-sm leading-relaxed">
                    <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-positive" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {interview.improvements.length > 0 && (
            <div>
              <h2 className="text-lg font-medium text-warn">What to work on</h2>
              <ul className="mt-3 flex flex-col gap-2.5">
                {interview.improvements.map((s, i) => (
                  <li key={s} className="flex gap-2.5 text-sm leading-relaxed">
                    <span className="mt-0.5 shrink-0 text-xs tabular-nums text-muted">{i + 1}.</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* ── how the interview adapted ────────────────────────────────────── */}
      {interview.difficultyChanges.length > 0 && (
        <section className="mt-12 border-t border-line pt-10">
          <h2 className="text-lg font-medium">How the interview adapted to you</h2>
          <p className="mt-1 text-sm text-muted">
            Difficulty started at {interview.startingDifficulty} and moved with your performance.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {interview.difficultyChanges.map((c) => (
              <li key={`${c.turnIndex}-${c.to}`} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={c.to === 'senior' ? 'positive' : c.to === 'junior' ? 'warn' : 'accent'}>
                  After Q{c.turnIndex + 1}: {c.from} → {c.to}
                </Badge>
                <span className="text-xs text-muted">{c.trigger}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── per-question ─────────────────────────────────────────────────── */}
      <section className="mt-12 border-t border-line pt-10">
        <h2 className="text-lg font-medium">Question by question</h2>
        <ul className="mt-6 flex flex-col divide-y divide-line border-t border-line">
          {turns.map((turn) => (
            <li key={turn.id} className="py-6">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs tabular-nums text-muted">Q{turn.index + 1}</span>
                    {turn.isFollowUp && <Badge tone="accent">Follow-up</Badge>}
                    <Badge>{turn.difficulty}</Badge>
                    {turn.inputMode === 'text' && <Badge>Typed</Badge>}
                    {turn.groundedIn.length > 0 && <Badge tone="positive">From your CV</Badge>}
                  </div>
                  <p className="mt-2.5 font-medium leading-snug">{turn.questionText}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 text-2xl font-medium tabular-nums',
                    turn.scores.total >= 70
                      ? 'text-positive'
                      : turn.scores.total >= 45
                        ? 'text-text'
                        : 'text-warn',
                  )}
                >
                  {Math.round(turn.scores.total)}
                </span>
              </div>

              <p className="mt-3 border-l-2 border-line pl-4 text-sm leading-relaxed text-muted">
                {turn.transcript}
              </p>

              {turn.feedback && <p className="mt-3 text-sm leading-relaxed">{turn.feedback}</p>}

              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                <Stat label="Relevance" value={turn.scores.relevance} />
                <Stat label="Clarity" value={turn.scores.clarity} />
                <Stat label="Structure" value={turn.scores.structure} />
                {turn.metrics.wpm !== null && <Stat label="Pace" value={`${turn.metrics.wpm} wpm`} />}
                <Stat label="Words" value={turn.metrics.wordCount} />
                {turn.metrics.fillerCount > 0 && (
                  <Stat label="Fillers" value={turn.metrics.fillerCount} />
                )}
              </dl>
            </li>
          ))}
        </ul>

        {typedCount > 0 && (
          <p className="mt-6 text-xs text-muted">
            {typedCount} answer{typedCount === 1 ? ' was' : 's were'} typed rather than spoken, so
            pace was not scored for {typedCount === 1 ? 'it' : 'them'}.
          </p>
        )}
      </section>

      <div className="mt-12 flex gap-3 border-t border-line pt-8">
        <Link
          href="/setup"
          className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white transition-[filter] hover:brightness-110"
        >
          Practise again
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-muted/60"
        >
          Back to dashboard
        </Link>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex gap-1.5">
      <dt>{label}</dt>
      <dd className="font-medium tabular-nums text-text">{value}</dd>
    </div>
  );
}
