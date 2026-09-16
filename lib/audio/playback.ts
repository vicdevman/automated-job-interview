/**
 * TTS playback with an AnalyserNode tap.
 *
 * The analyser is the whole point: PRD §11.4 drives the avatar's mouth from the
 * real amplitude of the audio being spoken, not from a canned animation loop.
 * That is what sells "alive".
 *
 * Barge-in (PRD §6.2) needs playback to stop within 200ms, so the source node
 * is kept addressable and `stop()` kills it immediately rather than waiting for
 * the buffer to drain.
 */

export interface PlaybackHandle {
  /** 0..1, sampled from the analyser. Read it from a requestAnimationFrame loop. */
  amplitude(): number;
  /** Resolves when playback finishes naturally; resolves early if stopped. */
  finished: Promise<void>;
  stop(): void;
  readonly playing: boolean;
}

let sharedContext: AudioContext | null = null;

/** One AudioContext for output, reused across turns. */
export function playbackContext(): AudioContext {
  if (!sharedContext || sharedContext.state === 'closed') {
    sharedContext = new AudioContext({ latencyHint: 'interactive' });
  }
  return sharedContext;
}

/**
 * Browsers suspend a context created without a user gesture. Call this from a
 * click handler where possible.
 *
 * CRITICAL: resume() on a suspended context outside a gesture returns a promise
 * that Chrome NEVER settles — it stays pending until a real gesture arrives.
 * Awaiting it unguarded froze the entire interview boot: no question audio, no
 * microphone, and the screen stuck on "Connecting" indefinitely. It is now
 * raced against a short timer and the result is reported rather than awaited
 * indefinitely.
 *
 * @returns true if the context is running and audio will actually be heard.
 */
export async function unlockPlayback(timeoutMs = 1200): Promise<boolean> {
  const context = playbackContext();
  if (context.state === 'running') return true;

  await Promise.race([
    context.resume().catch(() => undefined),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);

  // Cast because control-flow narrowing from the early return above convinces
  // TypeScript the state can no longer be 'running'. resume() changes it at
  // runtime, which the type system cannot see.
  return (context.state as AudioContextState) === 'running';
}

/** True when playback is blocked and needs a click to release it. */
export function playbackBlocked(): boolean {
  return playbackContext().state !== 'running';
}

export async function closePlayback(): Promise<void> {
  if (sharedContext && sharedContext.state !== 'closed') await sharedContext.close();
  sharedContext = null;
}

/**
 * Plays an entire audio response.
 *
 * Speechmatics TTS streams, but Web Audio cannot decode a partial WAV — the
 * header declares lengths the decoder needs. So the body is collected and then
 * decoded. First-audio latency is therefore synthesis time plus transfer, which
 * is why PRD §16 says to keep question text short. Swapping in a provider that
 * emits raw chunks would let this become incremental without changing callers.
 */
export async function playAudioResponse(
  response: Response,
  opts: { onEnded?: () => void } = {},
): Promise<PlaybackHandle> {
  if (!response.ok) {
    throw new Error(`Speech request failed with ${response.status}.`);
  }

  const bytes = await response.arrayBuffer();
  const context = playbackContext();
  // Same trap as unlockPlayback: never await resume() unguarded.
  if (context.state !== 'running') await unlockPlayback();

  const buffer = await context.decodeAudioData(bytes);

  const source = context.createBufferSource();
  source.buffer = buffer;

  const analyser = context.createAnalyser();
  // Small FFT: we want a fast-reacting amplitude envelope, not spectral detail.
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.6;

  const gain = context.createGain();
  gain.gain.value = 1;

  source.connect(analyser);
  analyser.connect(gain);
  gain.connect(context.destination);

  const bins = new Uint8Array(analyser.frequencyBinCount);

  let playing = true;
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  function teardown() {
    if (!playing) return;
    playing = false;
    try {
      source.disconnect();
      analyser.disconnect();
      gain.disconnect();
    } catch {
      /* already disconnected */
    }
    opts.onEnded?.();
    resolveFinished();
  }

  source.onended = teardown;
  source.start();

  return {
    get playing() {
      return playing;
    },
    finished,
    amplitude() {
      if (!playing) return 0;
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = 0; i < bins.length; i++) {
        const v = bins[i] ?? 0;
        sum += v * v;
      }
      // RMS over the bins, normalised to 0..1.
      return Math.min(1, Math.sqrt(sum / bins.length) / 128);
    },
    stop() {
      if (!playing) return;
      try {
        // A 20ms ramp instead of a hard cut — stopping an oscillating waveform
        // at a non-zero sample produces an audible click.
        const now = context.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0.0001, now + 0.02);
        source.stop(now + 0.025);
      } catch {
        /* already stopped */
      }
      teardown();
    },
  };
}
