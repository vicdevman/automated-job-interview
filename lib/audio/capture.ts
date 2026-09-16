import type { SttAudioSpec } from '@/lib/providers/stt/types';

/**
 * getUserMedia + AudioWorklet wiring. Produces PCM frames at whatever rate the
 * STT provider declared in its audioSpec — nothing here hardcodes 16kHz.
 */

export interface CaptureHandlers {
  onFrame: (frame: ArrayBuffer) => void;
  /** 0..1 running RMS. Drives the level meter and barge-in detection. */
  onLevel?: (rms: number) => void;
  onError?: (error: Error) => void;
}

export interface MicCapture {
  readonly sampleRate: number;
  /** Muting keeps the graph alive and keeps silent frames flowing (PRD §6.1). */
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  stop(): Promise<void>;
}

export class MicPermissionError extends Error {
  constructor(readonly reason: 'denied' | 'not-found' | 'insecure' | 'unsupported' | 'unknown', message: string) {
    super(message);
    this.name = 'MicPermissionError';
  }
}

/** Maps the browser's opaque getUserMedia failures onto something actionable. */
function toPermissionError(e: unknown): MicPermissionError {
  const name = e instanceof Error ? e.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new MicPermissionError(
        'denied',
        'Microphone access was blocked. Allow it in your browser’s site settings, then try again.',
      );
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new MicPermissionError('not-found', 'No microphone was found on this device.');
    case 'NotReadableError':
      return new MicPermissionError(
        'unknown',
        'The microphone is in use by another application. Close it and try again.',
      );
    default:
      return new MicPermissionError(
        'unknown',
        e instanceof Error ? e.message : 'Could not open the microphone.',
      );
  }
}

export async function startCapture(
  spec: SttAudioSpec,
  handlers: CaptureHandlers,
): Promise<MicCapture> {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new MicPermissionError(
      'unsupported',
      'This browser does not support microphone capture. Chrome, Edge, Firefox or Safari 16.4+ are required.',
    );
  }
  if (!window.isSecureContext) {
    throw new MicPermissionError(
      'insecure',
      'Microphone access needs HTTPS (or localhost).',
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (e) {
    throw toPermissionError(e);
  }

  // Asking for the target rate lets the browser resample natively, which beats
  // anything the worklet can do. The worklet handles the case where the browser
  // ignores the request.
  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: spec.sampleRate, latencyHint: 'interactive' });
  } catch {
    context = new AudioContext({ latencyHint: 'interactive' });
  }

  try {
    // A hung fetch here would block the whole interview, so it is bounded.
    await Promise.race([
      context.audioWorklet.addModule('/worklets/pcm-processor.js'),
      new Promise((_, rejectLoad) =>
        setTimeout(() => rejectLoad(new Error('timed out fetching the audio worklet')), 10_000),
      ),
    ]);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    await context.close();
    throw new Error(
      `Could not load the audio worklet: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const source = context.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(context, 'pcm-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    processorOptions: { targetRate: spec.sampleRate, frameSize: spec.frameSize },
  });

  worklet.port.onmessage = (event: MessageEvent) => {
    const data = event.data as { type: string; pcm?: ArrayBuffer; rms?: number };
    if (data.type !== 'frame' || !data.pcm) return;
    handlers.onLevel?.(data.rms ?? 0);
    handlers.onFrame(data.pcm);
  };

  worklet.onprocessorerror = () => {
    handlers.onError?.(new Error('The audio worklet stopped unexpectedly.'));
  };

  source.connect(worklet);

  // Autoplay policy leaves a context created outside a user gesture suspended,
  // and in Chrome resume() then returns a promise that NEVER settles until a
  // real gesture arrives. Awaiting it unguarded is how the interview screen got
  // stuck on "Connecting" forever. Race it, and carry on either way: a live
  // getUserMedia stream usually lets the context start on its own shortly after.
  if (context.state === 'suspended') {
    await Promise.race([
      context.resume().catch(() => undefined),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  }

  let muted = false;

  return {
    sampleRate: context.sampleRate,
    get muted() {
      return muted;
    },
    setMuted(next: boolean) {
      muted = next;
      worklet.port.postMessage({ type: 'mute', value: next });
    },
    async stop() {
      worklet.port.onmessage = null;
      try {
        source.disconnect();
        worklet.disconnect();
      } catch {
        /* already torn down */
      }
      stream.getTracks().forEach((t) => t.stop());
      if (context.state !== 'closed') await context.close();
    },
  };
}
