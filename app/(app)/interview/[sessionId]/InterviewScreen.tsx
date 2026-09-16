'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InterviewerAvatar } from '@/components/avatar/InterviewerAvatar';
import { MicButton } from '@/components/interview/MicButton';
import { PaceMeter, TurnIndicator } from '@/components/interview/TurnIndicator';
import { TranscriptPane } from '@/components/interview/TranscriptPane';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { useInterview, type Question } from '@/lib/interview/useInterview';
import { cn } from '@/lib/cn';

/**
 * PRD §11.3 — the interview screen carries almost no chrome. A thin status
 * rail, the avatar, the question, the live transcript, one control. Everything
 * else is a distraction during a stressful moment.
 */
export function InterviewScreen(props: {
  sessionId: string;
  roleTitle: string;
  level: string;
  voiceId: string;
  questions: Question[];
  firstQuestion: Question;
  questionCount: number;
  answeredSoFar: number;
}) {
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [confirmExit, setConfirmExit] = useState(false);

  const interview = useInterview({
    sessionId: props.sessionId,
    voiceId: props.voiceId,
    firstQuestion: props.firstQuestion,
    questions: props.questions,
    questionCount: props.questionCount,
    onFinished: () => void finish(),
  });

  async function finish(abandoned = false) {
    setFinishing(true);
    try {
      await fetch('/api/interview/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: props.sessionId, abandoned }),
      });
    } catch {
      // The results page will show whatever was persisted; a failed finish call
      // is not worth trapping the candidate on this screen.
    }
    router.push(`/results/${props.sessionId}`);
  }

  // If the microphone path failed, put the candidate straight into the typed
  // fallback rather than leaving them looking at a "Listening" pane that will
  // never receive anything (PRD §6.5).
  useEffect(() => {
    if (interview.voiceStatus === 'unavailable') setTyping(true);
  }, [interview.voiceStatus]);

  const answered = props.answeredSoFar + interview.questionIndex;
  const position = Math.min(answered + 1, props.questionCount);

  const avatarState =
    interview.state === 'speaking'
      ? 'speaking'
      : interview.state === 'listening'
        ? 'listening'
        : interview.state === 'thinking' || interview.state === 'connecting'
          ? 'thinking'
          : 'idle';

  return (
    <div className="-mx-4 -my-8 flex min-h-[calc(100dvh-53px)] flex-col sm:-mx-6 sm:-my-10 sm:min-h-[calc(100dvh-57px)]">
      {/* ── thin status rail ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 border-0 border-line px-6 py-3 pb-0">
        <TurnIndicator state={interview.state} level={interview.micLevel} />
        {interview.voiceStatus !== 'ready' && (
          <span
            className={cn(
              'text-xs',
              interview.voiceStatus === 'unavailable' ? 'text-warn' : 'text-muted',
            )}
          >
            {interview.voiceStatus === 'unavailable' ? 'mic unavailable' : 'mic connecting…'}
          </span>
        )}
        <span className="hidden truncate text-sm text-muted md:inline">
          {props.roleTitle} · {props.level}
        </span>
        <span className="ml-auto shrink-0 text-sm tabular-nums text-muted">
          Q{position}/{props.questionCount}
        </span>
        <button
          type="button"
          onClick={() => setConfirmExit(true)}
          aria-label="End the interview"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-text"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* ── progress rail ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 px-4 pt-3 sm:px-6" aria-hidden="true">
        {Array.from({ length: props.questionCount }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-0.5 flex-1 rounded-full transition-colors duration-500',
              i < answered ? 'bg-accent' : i === answered ? 'bg-accent/40' : 'bg-line',
            )}
          />
        ))}
      </div>

      {/* ── the interview ─────────────────────────────────────────────────── */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-8 sm:gap-8 sm:px-6 sm:py-10">
        <InterviewerAvatar
          state={avatarState}
          amplitude={interview.amplitude}
          seed={props.sessionId}
        />

        {/* The question is rendered the moment it is known, before audio
            starts — the candidate can read and start thinking while the voice
            loads. */}
        <h1 className="max-w-xl text-balance text-center text-lg leading-snug sm:text-xl md:text-[1.75rem]">
          {interview.question.text}
        </h1>

        {interview.lastFeedback && interview.state === 'speaking' && (
          <p className="max-w-lg text-center text-sm leading-relaxed text-muted">
            {interview.lastFeedback.feedback}
          </p>
        )}

        <div className="w-full">
          {typing ? (
            <div className="flex flex-col gap-3">
              <Textarea
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                rows={5}
                autoFocus
                placeholder="Type your answer…"
                aria-label="Type your answer"
              />
              <div className="flex items-center gap-2">
                <Button
                  disabled={typed.trim().length < 2 || interview.state === 'thinking'}
                  loading={interview.state === 'thinking'}
                  onClick={() => {
                    interview.submitTyped(typed.trim());
                    setTyped('');
                    setTyping(false);
                  }}
                >
                  Submit answer
                </Button>
                {interview.micAvailable && (
                  <Button variant="ghost" onClick={() => setTyping(false)}>
                    Back to speaking
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <TranscriptPane
              finals={interview.finals}
              partial={interview.partial}
              placeholder={
                interview.voiceStatus === 'connecting'
                  ? 'Setting up your microphone… you can start typing instead at any time.'
                  : interview.voiceStatus === 'unavailable'
                    ? 'Your microphone is not available. Use "Type instead" below.'
                    : interview.state === 'speaking'
                      ? 'Start speaking whenever you like — the interviewer will stop.'
                      : interview.state === 'thinking'
                        ? 'Scoring your answer…'
                        : interview.state === 'connecting'
                          ? 'Getting ready…'
                          : 'Listening. Your words appear here as you speak.'
              }
            />
          )}
        </div>

        {interview.error && (
          <div className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3">
            <p className="min-w-48 flex-1 text-sm text-warn">{interview.error}</p>

            {/* The two things that actually recover a broken session, rather
                than only an acknowledgement. */}
            <Button size="sm" variant="secondary" onClick={() => void interview.enableSound()}>
              Enable sound
            </Button>
            {interview.voiceStatus === 'unavailable' && (
              <Button size="sm" variant="secondary" onClick={interview.retryVoice}>
                Retry microphone
              </Button>
            )}
            <button
              type="button"
              onClick={interview.dismissError}
              className="text-xs text-muted hover:text-text"
            >
              Dismiss
            </button>
          </div>
        )}
      </main>

      {/* ── one control ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 border-t border-line px-4 py-4 sm:px-6 sm:py-5">
        {!typing && (
          <MicButton
            state={interview.state}
            level={interview.micLevel}
            disabled={!interview.micAvailable}
            onBargeIn={interview.bargeIn}
            onDone={interview.done}
          />
        )}

        {!typing && interview.state === 'listening' && (
          <PaceMeter wpm={interview.metrics.wpm} fillerCount={interview.metrics.fillerCount} />
        )}

        {!typing && (
          <button
            type="button"
            onClick={() => setTyping(true)}
            className="text-sm text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
          >
            Type instead
          </button>
        )}
      </div>

      {/* ── exit confirmation ─────────────────────────────────────────────── */}
      {confirmExit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-surface/80 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-line bg-raised p-5 sm:p-6">
            <h2 className="text-lg font-medium">End the interview?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              The {answered} answer{answered === 1 ? '' : 's'} you have given
              {answered === 1 ? ' is' : ' are'} already saved, and you will still get a report for
              them.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="danger" loading={finishing} onClick={() => void finish(true)}>
                End and see results
              </Button>
              <Button variant="ghost" onClick={() => setConfirmExit(false)}>
                Keep going
              </Button>
            </div>
          </div>
        </div>
      )}

      {finishing && !confirmExit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-surface/80 backdrop-blur-sm">
          <p className="text-sm text-muted">Putting your report together…</p>
        </div>
      )}
    </div>
  );
}
