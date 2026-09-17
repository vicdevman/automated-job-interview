'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InterviewerAvatar } from '@/components/avatar/InterviewerAvatar';
import { CallActionBar } from '@/components/interview/CallActionBar';
import { ChevronIcon } from '@/components/interview/CallIcons';
import { ElapsedTimer } from '@/components/interview/ElapsedTimer';
import { PaceMeter, TurnIndicator } from '@/components/interview/TurnIndicator';
import { TranscriptPane } from '@/components/interview/TranscriptPane';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { useInterview, type Question } from '@/lib/interview/useInterview';
import { useCallHeader } from '@/lib/hooks/useCallHeader';
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
  // Fixed once, at mount — a call timer, not a re-derived value.
  const callStartedAt = useRef(Date.now()).current;
  // The app header defaults hidden on a call; this toggle (in the call's own
  // status bar below) is the only way to bring it back — no notch, no scroll.
  const { visible: appHeaderVisible, toggle: toggleAppHeader } = useCallHeader();

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
    <div className="-mx-4 -my-8 flex min-h-[calc(100dvh-53px)] flex-col sm:-my-10 sm:min-h-[calc(100dvh-57px)]">
      {/* ── the call header — sticky, replaces the app header on this screen.
          Offset by the app header's own fixed height (top-16) whenever the
          toggle below has revealed it, so the two never overlap. ── */}
      <div
        className={cn(
          'sticky z-30 flex items-center gap-3 border-b border-line bg-surface/90 px-4 py-4 backdrop-blur-md',
          'transition-[top] duration-300 ease-out sm:gap-4 sm:px-6',
          appHeaderVisible ? 'top-16' : 'top-0',
        )}
      >
       
        <TurnIndicator state={interview.state} level={interview.micLevel} />
        {interview.voiceStatus !== 'ready' && (
          <span
            className={
              interview.voiceStatus === 'unavailable'
                ? 'text-xs text-warn'
                : 'text-xs text-muted'
            }
          >
            {interview.voiceStatus === 'unavailable' ? 'mic unavailable' : 'mic connecting…'}
          </span>
        )}
        <span className="hidden truncate text-sm text-muted md:inline">
          {props.roleTitle} · {props.level}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-3 text-sm">
          <ElapsedTimer startedAt={callStartedAt} />
          <span className="tabular-nums text-muted border-l border-line pl-2">
            Q{position}/{props.questionCount}
          </span>
        </span>

         <button
          type="button"
          title="Open or Close Main header"
          onClick={toggleAppHeader}
          aria-expanded={appHeaderVisible}
          aria-label={appHeaderVisible ? 'Hide navigation' : 'Show navigation'}
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-raised hover:text-text"
        >
          <ChevronIcon
            className={cn('size-5 transition-transform duration-200', appHeaderVisible && 'rotate-180')}
          />
        </button>
      </div>

      {/* ── the interview ─────────────────────────────────────────────────── */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-8 pb-32 sm:gap-8 sm:px-6 sm:py-10 sm:pb-36">
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
              <Button
                disabled={typed.trim().length < 2 || interview.state === 'thinking'}
                loading={interview.state === 'thinking'}
                onClick={() => {
                  interview.submitTyped(typed.trim());
                  setTyped('');
                  setTyping(false);
                }}
                className="self-start"
              >
                Submit answer
              </Button>
            </div>
          ) : (
            <TranscriptPane
              finals={interview.finals}
              partial={interview.partial}
              placeholder={
                interview.voiceStatus === 'connecting'
                  ? 'Setting up your microphone… you can start typing instead at any time.'
                  : interview.voiceStatus === 'unavailable'
                    ? 'Your microphone is not available — tap the keyboard below.'
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

        {!typing && interview.state === 'listening' && (
          <PaceMeter wpm={interview.metrics.wpm} fillerCount={interview.metrics.fillerCount} />
        )}

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

      {/* ── floating call bar — sticky at the bottom of the viewport ────────── */}
      <CallActionBar
        state={interview.state}
        level={interview.micLevel}
        typing={typing}
        disabled={!interview.micAvailable}
        toggleDisabled={!interview.micAvailable}
        onToggleTyping={() => setTyping((v) => !v)}
        onBargeIn={interview.bargeIn}
        onDone={interview.done}
        onEndCall={() => setConfirmExit(true)}
      />

      {/* ── exit confirmation — triggered by the hang-up button above ───────── */}
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
