/**
 * PRD §3.2 — STT contract.
 *
 * STT has two complications the other capability kinds do not:
 *   1. the credential is minted on the server while the session runs in the
 *      browser, so the provider is split into a server half and a client half;
 *   2. providers come in realtime-streaming and batch-upload families.
 * Both are modelled here so the orchestrator branches once on `mode`.
 */

export type SttMode = 'realtime' | 'batch';

export interface SttAudioSpec {
  sampleRate: number;
  encoding: 'pcm_s16le';
  /** Samples per frame sent over the wire. */
  frameSize: number;
}

export interface SttIssuedToken {
  token: string;
  /** The provider decides the URL shape and how the token attaches to it. */
  wsUrl: string;
  /** Epoch ms. */
  expiresAt: number;
}

/** SERVER half. Holds the secret. Realtime providers only. */
export interface SttTokenIssuer {
  readonly id: string;
  readonly mode: 'realtime';
  issueToken(opts: { ttlSeconds: number }): Promise<SttIssuedToken>;
}

export interface SttFinalMeta {
  startTime: number;
  endTime: number;
}

export interface SttConnectOptions {
  wsUrl: string;
  language: string;
  audioSpec?: SttAudioSpec;
  onPartial: (text: string) => void;
  onFinal: (text: string, meta: SttFinalMeta) => void;
  onEndOfTurn: () => void;
  onError: (e: Error) => void;
  onClose: (code: number) => void;
}

export interface SttSession {
  sendAudio(frame: ArrayBuffer): void;
  sendSilence(ms: number): void;
  close(): Promise<void>;
  readonly state: 'connecting' | 'open' | 'closed';
}

/**
 * CLIENT half. Realtime providers only. Never sees the secret.
 *
 * `audioSpec` lives on the factory so the AudioWorklet configures itself from
 * whatever the provider wants instead of hardcoding 16kHz. A provider needing
 * 24kHz just declares it.
 */
export interface SttRealtimeFactory {
  readonly id: string;
  readonly mode: 'realtime';
  readonly audioSpec: SttAudioSpec;
  connect(opts: SttConnectOptions): Promise<SttSession>;
}

/** SERVER. Batch providers (Whisper, Speechmatics Batch). Audio uploaded whole. */
export interface SttBatchProvider {
  readonly id: string;
  readonly mode: 'batch';
  transcribe(req: { audio: Blob | Buffer; mimeType: string; language: string }): Promise<{
    text: string;
    durationSec: number;
    words?: { text: string; start: number; end: number }[];
  }>;
}
