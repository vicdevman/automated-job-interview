/**
 * ════════════════════════════════════════════════════════════════════════
 *  TURN TIMING — how patient the interviewer is while you are answering
 * ════════════════════════════════════════════════════════════════════════
 *
 * THIS IS THE FILE TO EDIT if the interviewer cuts you off too quickly, or
 * conversely sits waiting too long after you have clearly finished.
 *
 * Ending a turn too early is the more damaging failure: a candidate pauses to
 * think mid-answer, gets interrupted, and the answer is scored half-finished.
 * So the defaults here are deliberately patient.
 *
 * There are TWO independent delays, and they add up:
 *
 *   total wait  =  PROVIDER_SILENCE_SEC  +  EXTRA_GRACE_MS
 *
 *   1. PROVIDER_SILENCE_SEC — measured by the transcription service itself,
 *      which is listening to the actual audio and knows the difference between
 *      silence and breathing. Accurate, but the vendor caps how large it can be.
 *
 *   2. EXTRA_GRACE_MS — measured by us, in the browser, after the provider says
 *      "they've stopped". If any new speech arrives during this window the
 *      submission is cancelled and the candidate simply carries on. This is
 *      where to add patience beyond the vendor's ceiling.
 *
 * Every value can also be set by environment variable without touching code.
 * They are NEXT_PUBLIC_ because this runs in the browser, and Next.js inlines
 * them AT BUILD TIME — so after changing one in .env.local you must restart
 * `npm run dev`, not just reload the page.
 */

function envNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Seconds of silence before the TRANSCRIPTION SERVICE decides you have
 * finished speaking.
 *
 * Was 0.8s, which is roughly the length of a normal mid-sentence thinking
 * pause — far too twitchy for interview answers, where people routinely stop
 * for a second to gather a thought. Raised to 2s.
 *
 * Speechmatics caps this at 2 seconds, so it is clamped below. If you want to
 * wait longer than 2 seconds, raise EXTRA_GRACE_MS instead — that is exactly
 * what it exists for.
 *
 * env: NEXT_PUBLIC_END_OF_UTTERANCE_SILENCE
 */
export const PROVIDER_SILENCE_SEC = Math.min(
  2,
  Math.max(0.2, envNumber(process.env.NEXT_PUBLIC_END_OF_UTTERANCE_SILENCE, 2)),
);

/**
 * Additional milliseconds WE wait after the provider signals end-of-turn,
 * before actually submitting the answer.
 *
 * Cancelled the instant any further speech arrives, so making this generous
 * costs a confident speaker nothing — they press "Done answering" and skip it
 * entirely. It only ever helps someone who trailed off mid-thought.
 *
 * Set to 0 to submit the moment the provider says so.
 *
 * env: NEXT_PUBLIC_TURN_GRACE_MS
 */
export const EXTRA_GRACE_MS = envNumber(process.env.NEXT_PUBLIC_TURN_GRACE_MS, 1500);

/**
 * Below this many words, an end-of-turn is treated as noise (a stray "um",
 * a cough the transcriber heard as a word) rather than a real answer, and is
 * not auto-submitted.
 *
 * IMPORTANT: this used to be 8, paired with a hard MIN_ANSWER_MS floor, and
 * together they silently ate the very first EndOfUtterance event on most real
 * answers — Speechmatics fires it once per pause, so if that first firing was
 * rejected, nothing else was coming and the candidate was stuck until they hit
 * "Done answering" by hand. That was a real, reported regression. Keep this
 * number small — it exists only to filter noise, never to gate a genuine
 * answer.
 *
 * env: NEXT_PUBLIC_MIN_ANSWER_WORDS
 */
export const MIN_ANSWER_WORDS = envNumber(process.env.NEXT_PUBLIC_MIN_ANSWER_WORDS, 2);

/**
 * How long the transcription service may buffer audio before emitting a
 * confirmed transcript. Higher is more accurate but makes the live text lag.
 *
 * env: NEXT_PUBLIC_STT_MAX_DELAY
 */
export const STT_MAX_DELAY_SEC = Math.min(
  4,
  Math.max(0.7, envNumber(process.env.NEXT_PUBLIC_STT_MAX_DELAY, 1)),
);

/**
 * The hard backstop. Everything above (PROVIDER_SILENCE_SEC, EXTRA_GRACE_MS)
 * depends on the transcription provider sending its own "you've stopped
 * talking" event — and that event can simply fail to arrive (a dropped
 * packet, a provider hiccup, anything). When that happens the candidate was
 * previously stuck forever with no way forward except the manual "Done
 * answering" button.
 *
 * This timer does not care about that event at all. It is reset every time
 * new words arrive (partial or final) while you are answering, and if it ever
 * runs out — meaning NOTHING new has been transcribed for this long, for any
 * reason — the answer is submitted anyway. It is deliberately set well above
 * the normal PROVIDER_SILENCE_SEC + EXTRA_GRACE_MS total, so in ordinary
 * operation it never fires first; it only ever matters when the normal path
 * has already failed.
 *
 * env: NEXT_PUBLIC_FALLBACK_SILENCE_MS
 */
export const FALLBACK_SILENCE_MS = envNumber(process.env.NEXT_PUBLIC_FALLBACK_SILENCE_MS, 6000);

/** Everything above, for logging and for the dev harness to display. */
export const TURN_TIMING = {
  providerSilenceSec: PROVIDER_SILENCE_SEC,
  extraGraceMs: EXTRA_GRACE_MS,
  minAnswerWords: MIN_ANSWER_WORDS,
  sttMaxDelaySec: STT_MAX_DELAY_SEC,
  fallbackSilenceMs: FALLBACK_SILENCE_MS,
  get totalWaitMs() {
    return PROVIDER_SILENCE_SEC * 1000 + EXTRA_GRACE_MS;
  },
} as const;
