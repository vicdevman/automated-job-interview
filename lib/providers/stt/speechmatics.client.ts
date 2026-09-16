import type { SttConnectOptions, SttRealtimeFactory, SttSession } from './types';

/**
 * PRD §3.1, §6.1 — the browser half of Speechmatics realtime.
 *
 * Protocol, in order:
 *   -> StartRecognition   (JSON)
 *   <- RecognitionStarted
 *   -> binary PCM frames
 *   <- AudioAdded / AddPartialTranscript / AddTranscript / EndOfUtterance
 *   -> EndOfStream        (JSON, carries last_seq_no)
 *   <- EndOfTranscript
 *
 * This file is the only place in the codebase that knows any of that. The rest
 * of the app sees onPartial / onFinal / onEndOfTurn.
 */

const AUDIO_SPEC = { sampleRate: 16000, encoding: 'pcm_s16le', frameSize: 1024 } as const;

/** PRD §12: reconnect with exponential backoff so a network drop is survivable. */
const RECONNECT_DELAYS_MS = [500, 1500, 4000];

/**
 * How long to wait for RecognitionStarted before giving up.
 *
 * The free tier allows two concurrent realtime sessions, and a socket abandoned
 * by a closed tab keeps counting against that for a while — so a second tab, or
 * a reload that did not close cleanly, can exhaust it. Usually the server then
 * replies with a quota_exceeded Error frame, which is handled below. This
 * timeout covers the worse case: the socket is accepted and the server never
 * says anything at all, leaving the promise pending forever and the screen
 * stuck on "Connecting" with no explanation.
 */
const CONNECT_TIMEOUT_MS = 12_000;

/** Thrown when the handshake times out, so callers can explain it properly. */
export class SttConnectTimeout extends Error {
  constructor() {
    super(
      'The transcription service accepted the connection but never started recognition. ' +
        'This usually means all concurrent connection slots are in use — close any other tabs ' +
        'running an interview and wait about a minute.',
    );
    this.name = 'SttConnectTimeout';
  }
}

/**
 * Speechmatics pads each transcript segment with surrounding spaces, so naively
 * joining segments yields "Tell  me  about a  time". Collapse runs of
 * whitespace and tighten the space before sentence punctuation.
 */
const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

function tidy(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim();
}

interface SpeechmaticsResult {
  type?: string;
  alternatives?: Array<{ content?: string }>;
  is_eos?: boolean;
}

interface SpeechmaticsMessage {
  message: string;
  metadata?: { transcript?: string; start_time?: number; end_time?: number };
  /** Word-level results. Used only as a fallback if metadata.transcript is absent. */
  results?: SpeechmaticsResult[];
  seq_no?: number;
  reason?: string;
  type?: string;
}

/**
 * Prefers metadata.transcript, which is the whole utterance already assembled.
 * Falls back to rebuilding it from the word-level results array, because the
 * vendor SDK reads results[] and a future protocol tweak could drop the
 * convenience field.
 */
function transcriptOf(msg: SpeechmaticsMessage): string {
  if (msg.metadata?.transcript) return tidy(msg.metadata.transcript);
  if (!Array.isArray(msg.results)) return '';
  return tidy(
    msg.results
      .map((r) => r.alternatives?.[0]?.content ?? '')
      .filter(Boolean)
      .join(' '),
  );
}

class SpeechmaticsSession implements SttSession {
  private socket: WebSocket | null = null;
  private seqNo = 0;
  private closing = false;
  private reconnectAttempt = 0;
  private started = false;
  /**
   * Set when the server rejected us for a reason retrying cannot fix — quota,
   * auth, bad config. Reconnecting on those just burns the (very small) free
   * tier concurrency allowance and produces a storm of identical failures.
   */
  private fatal = false;
  /** Frames produced while the socket is down, replayed on reconnect. */
  private pending: ArrayBuffer[] = [];

  state: 'connecting' | 'open' | 'closed' = 'connecting';

  constructor(private readonly opts: SttConnectOptions) {}

  private config() {
    const spec = this.opts.audioSpec ?? AUDIO_SPEC;
    return {
      message: 'StartRecognition',
      audio_format: {
        type: 'raw',
        encoding: spec.encoding,
        sample_rate: spec.sampleRate,
      },
      transcription_config: {
        language: this.opts.language || 'en',
        operating_point: 'enhanced',
        // Clamped to the ranges Speechmatics accepts. Anything outside them is
        // rejected with an Error frame rather than being quietly ignored.
        max_delay: clamp(this.opts.maxDelaySec ?? 1, 0.7, 4),
        enable_partials: true,
        // Provider-side turn detection. PRD §6.3: never hand-roll silence
        // timers. The VALUE is the application's choice, not this adapter's —
        // see lib/interview/turn-timing.ts. Speechmatics caps it at 2s; longer
        // waits are added on top by the caller.
        conversation_config: {
          end_of_utterance_silence_trigger: clamp(this.opts.endOfTurnSilenceSec ?? 2, 0, 2),
        },
      },
    };
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(this.opts.wsUrl);
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      this.state = 'connecting';

      // The handshake must never be allowed to hang. See CONNECT_TIMEOUT_MS.
      const handshakeTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.closing = true; // stop onclose from scheduling a reconnect
        try {
          socket.close(1000, 'handshake timeout');
        } catch {
          /* already gone */
        }
        reject(new SttConnectTimeout());
      }, CONNECT_TIMEOUT_MS);

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimer);
        fn();
      };

      socket.onopen = () => {
        socket.send(JSON.stringify(this.config()));
      };

      socket.onmessage = (event: MessageEvent) => {
        if (typeof event.data !== 'string') return;

        let msg: SpeechmaticsMessage;
        try {
          msg = JSON.parse(event.data) as SpeechmaticsMessage;
        } catch {
          return;
        }

        switch (msg.message) {
          case 'RecognitionStarted': {
            this.state = 'open';
            this.started = true;
            this.reconnectAttempt = 0;
            // Replay anything captured while the socket was down.
            const queued = this.pending;
            this.pending = [];
            for (const frame of queued) this.sendAudio(frame);
            settle(resolve);
            break;
          }

          case 'AddPartialTranscript': {
            const text = transcriptOf(msg);
            if (text) this.opts.onPartial(text);
            break;
          }

          case 'AddTranscript': {
            const text = transcriptOf(msg);
            if (text) {
              this.opts.onFinal(text, {
                startTime: msg.metadata?.start_time ?? 0,
                endTime: msg.metadata?.end_time ?? 0,
              });
            }
            break;
          }

          case 'EndOfUtterance':
            this.opts.onEndOfTurn();
            break;

          case 'EndOfTranscript':
            this.state = 'closed';
            break;

          case 'Error': {
            const kind = (msg.type ?? '').toLowerCase();
            this.fatal =
              kind.includes('quota') ||
              kind.includes('auth') ||
              kind.includes('forbidden') ||
              kind.includes('not_authorised') ||
              kind.includes('invalid');

            const error = new Error(
              kind.includes('quota')
                ? 'The transcription service is already handling another session on this account. ' +
                  'Close any other interview tab, wait a few seconds, and retry the microphone.'
                : `Speechmatics error (${msg.type ?? 'unknown'}): ${msg.reason ?? 'no reason given'}`,
            );
            if (settled) this.opts.onError(error);
            else settle(() => reject(error));
            break;
          }

          case 'Warning':
            console.warn('[speechmatics]', msg.type, msg.reason);
            break;

          default:
            // AudioAdded and anything the vendor adds later. Nothing to do.
            break;
        }
      };

      socket.onerror = () => {
        settle(() => reject(new Error('Could not reach the transcription service.')));
      };

      socket.onclose = (event: CloseEvent) => {
        this.state = 'closed';
        this.started = false;

        // Closed before the handshake completed — reject rather than leaving the
        // caller waiting on a promise that can no longer settle.
        if (!settled) {
          settle(() =>
            reject(
              new Error(
                `The transcription service closed the connection during setup (code ${event.code}). ` +
                  'If this persists, all concurrent connection slots may be in use.',
              ),
            ),
          );
          return;
        }

        if (this.closing || this.fatal) {
          this.opts.onClose(event.code);
          return;
        }
        void this.reconnect(event.code);
      };
    });
  }

  private async reconnect(closeCode: number) {
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt];
    if (delay === undefined) {
      // Out of retries. The token may simply have expired — the caller mints a
      // new one and starts a fresh session rather than retrying forever.
      this.opts.onClose(closeCode);
      return;
    }
    this.reconnectAttempt += 1;

    await new Promise((r) => setTimeout(r, delay));
    if (this.closing) return;

    try {
      this.seqNo = 0;
      await this.connect();
    } catch (e) {
      this.opts.onError(
        e instanceof Error ? e : new Error('Reconnecting to the transcription service failed.'),
      );
    }
  }

  sendAudio(frame: ArrayBuffer): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.started) {
      // Hold a short tail so a brief drop does not punch a hole in the answer.
      if (this.pending.length < 200) this.pending.push(frame);
      return;
    }
    this.socket.send(frame);
    this.seqNo += 1;
  }

  /**
   * PRD §6.1 step 4 — during the interviewer's turn the mic is muted but the
   * socket must keep receiving audio, or the session idles out. Reconnecting
   * per question would add ~300ms of dead air to every turn.
   */
  sendSilence(ms: number): void {
    const spec = this.opts.audioSpec ?? AUDIO_SPEC;
    const samples = Math.round((spec.sampleRate * ms) / 1000);
    if (samples <= 0) return;
    this.sendAudio(new Int16Array(samples).buffer);
  }

  async close(): Promise<void> {
    this.closing = true;
    const socket = this.socket;
    if (!socket) {
      this.state = 'closed';
      return;
    }

    if (socket.readyState === WebSocket.OPEN && this.started) {
      try {
        socket.send(JSON.stringify({ message: 'EndOfStream', last_seq_no: this.seqNo }));
      } catch {
        /* the socket died first; closing anyway */
      }
    }

    await new Promise<void>((resolve) => {
      const done = () => resolve();
      const timer = setTimeout(done, 1500);
      socket.addEventListener('close', () => {
        clearTimeout(timer);
        done();
      });
      try {
        socket.close(1000, 'client finished');
      } catch {
        clearTimeout(timer);
        done();
      }
    });

    this.state = 'closed';
    this.socket = null;
  }
}

export const speechmaticsRealtime: SttRealtimeFactory = {
  id: 'speechmatics',
  mode: 'realtime',
  audioSpec: AUDIO_SPEC,

  async connect(opts: SttConnectOptions): Promise<SttSession> {
    const session = new SpeechmaticsSession(opts);
    await session.connect();
    return session;
  },
};
