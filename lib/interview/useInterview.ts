'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { startCapture, MicPermissionError, type MicCapture } from '@/lib/audio/capture';
import {
  playAudioResponse,
  playbackBlocked,
  unlockPlayback,
  type PlaybackHandle,
} from '@/lib/audio/playback';
import { sttFactory } from '@/lib/providers/registry.client';
import type { SttSession } from '@/lib/providers/stt/types';
import { analyseFillers, countWords, wordsPerMinute } from './scoring';
import {
  EXTRA_GRACE_MS,
  MIN_ANSWER_MS,
  MIN_ANSWER_WORDS,
  PROVIDER_SILENCE_SEC,
  STT_MAX_DELAY_SEC,
} from './turn-timing';

/**
 * PRD §6 — the client half of the turn machine.
 *
 * States, and what the candidate sees in each:
 *   connecting → opening the mic and the transcription socket
 *   speaking   → the interviewer is talking; mic is muted but live (barge-in armed)
 *   listening  → the candidate is answering; partials stream in
 *   thinking   → the answer is being scored
 *   finished   → all questions done
 *
 * Two behaviours are worth calling out:
 *   - the audio for question N+1 is fetched while the candidate answers
 *     question N, because TTS first-byte measured 2–3s and that is the only way
 *     to keep it off the critical path;
 *   - the socket is never closed between turns. During the interviewer's turn
 *     the worklet transmits silence, which keeps the session alive without the
 *     ~300ms reconnect cost per question.
 */

export type InterviewState =
  | 'connecting'
  | 'speaking'
  | 'listening'
  | 'thinking'
  | 'finished'
  | 'error';

/** The microphone/transcription path, which is independent of whose turn it is. */
export type VoiceStatus = 'connecting' | 'ready' | 'unavailable';

export interface Question {
  id: string;
  text: string;
  competency: string;
  difficulty: string;
  kind: string;
  groundedIn: string[];
  expectedPoints: string[];
}

export interface TurnFeedback {
  total: number;
  feedback: string;
  difficultyChanged: boolean;
  difficultyTrigger: string;
}

export interface LiveMetrics {
  wordCount: number;
  wpm: number | null;
  fillerCount: number;
}

interface Options {
  sessionId: string;
  voiceId: string;
  firstQuestion: Question;
  questions: Question[];
  questionCount: number;
  onFinished: () => void;
}

/** Barge-in threshold: sustained speech, not a cough or a keyboard tap. */
const BARGE_IN_RMS = 0.035;
const BARGE_IN_FRAMES = 4; // ~256ms at 1024 samples / 16kHz

export function useInterview(opts: Options) {
  const [state, setState] = useState<InterviewState>('connecting');
  const [question, setQuestion] = useState<Question>(opts.firstQuestion);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [partial, setPartial] = useState('');
  const [finals, setFinals] = useState<string[]>([]);
  const [amplitude, setAmplitude] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [lastFeedback, setLastFeedback] = useState<TurnFeedback | null>(null);
  const [metrics, setMetrics] = useState<LiveMetrics>({ wordCount: 0, wpm: null, fillerCount: 0 });
  const [error, setError] = useState<string | null>(null);
  const [micAvailable, setMicAvailable] = useState(true);
  /** Whether the microphone path is usable, shown separately from the turn state. */
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('connecting');

  // ── refs: mutable machinery the render loop must not depend on ──────────
  const captureRef = useRef<MicCapture | null>(null);
  const sessionRef = useRef<SttSession | null>(null);
  const playbackRef = useRef<PlaybackHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const prefetchRef = useRef<Map<string, Promise<Response>>>(new Map());
  const stateRef = useRef<InterviewState>('connecting');
  const bargeFramesRef = useRef(0);
  const finalsRef = useRef<string[]>([]);
  const partialRef = useRef('');
  const questionRef = useRef<Question>(opts.firstQuestion);
  const timingsRef = useRef({
    questionSpokenAt: null as number | null,
    answerStartedAt: null as number | null,
  });
  /** Pending auto-submit during the post-end-of-turn grace window. */
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  const startedRef = useRef(false);
  const teardownRef = useRef(false);

  const setPhase = useCallback((next: InterviewState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /**
   * Cancels a pending auto-submit. Called whenever new speech arrives, when a
   * turn ends by any other route, and on teardown — so the grace window can
   * never fire into a turn it no longer belongs to.
   */
  const cancelGrace = useCallback(() => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

  // ── live feedback (PRD §6.4) ─────────────────────────────────────────────
  const recomputeMetrics = useCallback(() => {
    const text = [...finalsRef.current, partialRef.current].join(' ').trim();
    const words = countWords(text);
    const startedAt = timingsRef.current.answerStartedAt;
    const elapsed = startedAt ? Date.now() - startedAt : 0;
    setMetrics({
      wordCount: words,
      wpm: elapsed > 2000 ? Math.round(wordsPerMinute(words, elapsed) ?? 0) || null : null,
      fillerCount: analyseFillers(text, words).fillerCount,
    });
  }, []);

  // ── TTS, with prefetch ───────────────────────────────────────────────────
  const requestAudio = useCallback(
    (text: string): Promise<Response> =>
      fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: opts.voiceId }),
      }),
    [opts.voiceId],
  );

  const prefetch = useCallback(
    (q: Question | null | undefined) => {
      if (!q || prefetchRef.current.has(q.id)) return;
      // Kick it off and swallow rejections — a failed prefetch just means the
      // real request pays the latency.
      const promise = requestAudio(q.text);
      promise.catch(() => prefetchRef.current.delete(q.id));
      prefetchRef.current.set(q.id, promise);
    },
    [requestAudio],
  );

  const takeAudio = useCallback(
    (q: Question): Promise<Response> => {
      const cached = prefetchRef.current.get(q.id);
      if (cached) {
        prefetchRef.current.delete(q.id);
        return cached;
      }
      return requestAudio(q.text);
    },
    [requestAudio],
  );

  // ── the interviewer's turn ───────────────────────────────────────────────
  const speak = useCallback(
    async (q: Question, nextToPrefetch: Question | null) => {
      setPhase('speaking');
      captureRef.current?.setMuted(true);
      bargeFramesRef.current = 0;
      timingsRef.current = { questionSpokenAt: null, answerStartedAt: null };

      // Start fetching the NEXT question's audio right away; it will be ready
      // long before the candidate finishes answering this one.
      prefetch(nextToPrefetch);

      try {
        const response = await takeAudio(q);
        if (teardownRef.current) return;

        if (!response.ok) throw new Error('The interviewer could not speak that question.');

        const handle = await playAudioResponse(response);
        playbackRef.current = handle;

        const tick = () => {
          if (!handle.playing) return;
          setAmplitude(handle.amplitude());
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);

        await handle.finished;
      } catch (e) {
        // A TTS failure must not end the interview — the question is on screen,
        // so the candidate can simply answer it.
        console.error('[interview] speech failed', e);
      } finally {
        setAmplitude(0);
        playbackRef.current = null;
      }

      if (teardownRef.current) return;
      beginListening();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefetch, takeAudio, setPhase],
  );

  const beginListening = useCallback(() => {
    if (teardownRef.current) return;
    cancelGrace();
    timingsRef.current.questionSpokenAt = Date.now();
    timingsRef.current.answerStartedAt = null;
    finalsRef.current = [];
    partialRef.current = '';
    setFinals([]);
    setPartial('');
    setMetrics({ wordCount: 0, wpm: null, fillerCount: 0 });
    captureRef.current?.setMuted(false);
    setPhase('listening');
  }, [setPhase]);

  /** PRD §6.2 — stop the interviewer mid-sentence and start listening. */
  const bargeIn = useCallback(() => {
    if (stateRef.current !== 'speaking') return;
    playbackRef.current?.stop();
    playbackRef.current = null;
    setAmplitude(0);
    beginListening();
  }, [beginListening]);

  // ── submitting an answer ─────────────────────────────────────────────────
  const submit = useCallback(
    async (override?: { transcript: string; inputMode: 'voice' | 'text' }) => {
      if (submittingRef.current) return;

      const spoken = [...finalsRef.current, partialRef.current].join(' ').replace(/\s+/g, ' ').trim();
      const transcript = override?.transcript ?? spoken;
      const inputMode = override?.inputMode ?? 'voice';

      if (!transcript) {
        setError('Nothing was captured. Try answering again, or type your answer instead.');
        return;
      }

      submittingRef.current = true;
      cancelGrace();
      setError(null);
      captureRef.current?.setMuted(true);
      setPhase('thinking');

      const answerEndedAt = Date.now();

      try {
        const response = await fetch('/api/interview/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: opts.sessionId,
            questionId: questionRef.current.id,
            questionText: questionRef.current.text,
            transcript,
            inputMode,
            isFollowUp: questionRef.current.id.startsWith('fu-'),
            timings: {
              questionSpokenAt: timingsRef.current.questionSpokenAt,
              answerStartedAt: inputMode === 'text' ? null : timingsRef.current.answerStartedAt,
              answerEndedAt: inputMode === 'text' ? null : answerEndedAt,
            },
          }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'Could not score that answer.');

        setLastFeedback({
          total: body.scores?.total ?? 0,
          feedback: body.feedback ?? '',
          difficultyChanged: body.difficulty?.changed ?? false,
          difficultyTrigger: body.difficulty?.trigger ?? '',
        });

        if (body.nextQuestion) {
          const next = body.nextQuestion as Question;
          questionRef.current = next;
          setQuestion(next);
          setQuestionIndex((i) => i + 1);
          submittingRef.current = false;

          // The question after this one, so it can be prefetched during the
          // answer we are about to hear.
          const upcoming = opts.questions[opts.questions.findIndex((q) => q.id === next.id) + 1];
          await speak(next, upcoming ?? null);
        } else {
          setPhase('finished');
          submittingRef.current = false;
          opts.onFinished();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        submittingRef.current = false;
        // Let them try again rather than stranding them in "thinking".
        setPhase('listening');
        captureRef.current?.setMuted(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.sessionId, opts.questions, speak, setPhase],
  );

  const submitRef = useRef(submit);
  submitRef.current = submit;

  /** Assigned during boot so the UI can retry the microphone after a failure. */
  const setupVoiceRef = useRef<(() => Promise<void>) | null>(null);

  // ── boot ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    teardownRef.current = false;

    /**
     * Opens the microphone and the transcription socket.
     *
     * Runs IN PARALLEL with the first question's speech, never in front of it.
     * An earlier version awaited this before speaking, so any stall here left
     * the candidate staring at "Connecting" with a silent interviewer. The
     * interviewer's voice must never depend on the candidate's microphone.
     */
    const setupVoice = async () => {
      try {
        setVoiceStatus('connecting');

        const tokenResponse = await fetch('/api/stt/token');
        if (!tokenResponse.ok) throw new Error('Could not get a transcription token.');
        const { wsUrl } = (await tokenResponse.json()) as { wsUrl: string };

        const factory = sttFactory();
        const sttSession = await factory.connect({
            wsUrl,
            language: 'en',
            audioSpec: factory.audioSpec,
            onPartial: (text) => {
              if (stateRef.current !== 'listening') return;
              if (timingsRef.current.answerStartedAt === null) {
                timingsRef.current.answerStartedAt = Date.now();
              }
              // The candidate is talking again, so they had not finished.
              cancelGrace();
              partialRef.current = text;
              setPartial(text);
              recomputeMetrics();
            },
            onFinal: (text) => {
              if (stateRef.current !== 'listening') return;
              if (timingsRef.current.answerStartedAt === null) {
                timingsRef.current.answerStartedAt = Date.now();
              }
              cancelGrace();
              finalsRef.current = [...finalsRef.current, text];
              partialRef.current = '';
              setFinals(finalsRef.current);
              setPartial('');
              recomputeMetrics();
            },
            onEndOfTurn: () => {
              // PRD §6.3 — the provider's endpointing is the primary signal,
              // but it is not the only word. Two guards sit in front of it, both
              // tunable in lib/interview/turn-timing.ts.
              if (stateRef.current !== 'listening') return;
              if (finalsRef.current.length === 0) return;

              const spoken = [...finalsRef.current, partialRef.current].join(' ');
              const words = countWords(spoken);
              const startedAt = timingsRef.current.answerStartedAt;
              const elapsed = startedAt ? Date.now() - startedAt : 0;

              // Guard 1: too short to be a real answer. Someone who opens with
              // "So, um…" and pauses to think is not finished.
              if (words < MIN_ANSWER_WORDS || elapsed < MIN_ANSWER_MS) return;

              // Guard 2: wait a little longer in case they were only pausing.
              // Any further speech cancels this via cancelGrace().
              cancelGrace();
              graceTimerRef.current = setTimeout(() => {
                graceTimerRef.current = null;
                if (stateRef.current === 'listening') void submitRef.current();
              }, EXTRA_GRACE_MS);
            },
          onError: (e) => console.error('[interview] stt', e),
          onClose: (code) => console.warn('[interview] stt closed', code),
        });

        if (teardownRef.current) {
          void sttSession.close();
          return;
        }
        sessionRef.current = sttSession;

        const capture = await startCapture(factory.audioSpec, {
          onFrame: (frame) => sessionRef.current?.sendAudio(frame),
          onLevel: (rms) => {
            setMicLevel(rms);
            if (stateRef.current === 'speaking') {
              bargeFramesRef.current = rms > BARGE_IN_RMS ? bargeFramesRef.current + 1 : 0;
              if (bargeFramesRef.current >= BARGE_IN_FRAMES) {
                bargeFramesRef.current = 0;
                bargeIn();
              }
            }
          },
          onError: (e) => console.error('[interview] capture', e),
        });

        if (teardownRef.current) {
          void capture.stop();
          return;
        }
        captureRef.current = capture;

        // Setup finished while a turn was already in progress, so match the mic
        // to whatever state we are actually in rather than assuming muted.
        capture.setMuted(stateRef.current !== 'listening');
        setVoiceStatus('ready');
      } catch (e) {
        // No microphone is a degraded interview, not a failed one — the typed
        // fallback in PRD §6.5 covers it. The interview continues either way.
        console.error('[interview] voice setup failed', e);
        setMicAvailable(false);
        setVoiceStatus('unavailable');
        setError(
          e instanceof MicPermissionError
            ? `${e.message} You can still answer by typing.`
            : e instanceof Error
              ? `${e.message} You can still answer by typing.`
              : 'Voice input is unavailable. You can still answer by typing.',
        );
      }
    };

    setupVoiceRef.current = setupVoice;

    (async () => {
      try {
        const audible = await unlockPlayback();
        if (teardownRef.current) return;

        if (!audible && !playbackBlocked()) {
          // Context settled late; nothing to do.
        } else if (!audible) {
          setError(
            'Your browser has blocked audio until you interact with the page. ' +
              'Click anywhere, or press Enable sound, to hear the interviewer.',
          );
        }

        // Start BOTH at once. The interviewer begins talking immediately; the
        // microphone catches up in the background and is unmuted by
        // beginListening() or by setupVoice() itself, whichever lands last.
        void setupVoice();
        await speak(opts.firstQuestion, opts.questions[1] ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    })();

    return () => {
      teardownRef.current = true;
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      playbackRef.current?.stop();
      void captureRef.current?.stop();
      void sessionRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const transcript = [...finals, partial].join(' ').replace(/\s+/g, ' ').trim();

  return {
    state,
    question,
    questionIndex,
    questionCount: opts.questionCount,
    finals,
    partial,
    transcript,
    amplitude,
    micLevel,
    metrics,
    lastFeedback,
    error,
    micAvailable,
    voiceStatus,
    /**
     * Re-runs microphone and socket setup. Exposed because the commonest
     * failure — the single concurrent-connection slot being busy — clears on
     * its own after a few seconds, so a retry button is the right fix rather
     * than making the candidate restart the interview.
     */
    retryVoice: () => {
      void captureRef.current?.stop();
      captureRef.current = null;
      void sessionRef.current?.close();
      sessionRef.current = null;
      setMicAvailable(true);
      setError(null);
      void setupVoiceRef.current?.();
    },
    /** Releases audio that the browser blocked for want of a user gesture. */
    enableSound: async () => {
      const ok = await unlockPlayback();
      if (ok) setError(null);
      return ok;
    },
    /** The "Done answering" manual override (PRD §6.3). */
    done: () => void submitRef.current(),
    submitTyped: (text: string) => void submitRef.current({ transcript: text, inputMode: 'text' }),
    bargeIn,
    dismissError: () => setError(null),
  };
}
