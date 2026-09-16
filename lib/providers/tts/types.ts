/**
 * PRD §3.2 — TTS contract.
 *
 * Covers HTTP providers (Speechmatics, ElevenLabs, OpenAI) directly. A
 * WebSocket-streaming provider such as Cartesia is covered too: its adapter
 * consumes the vendor socket server-side and pipes it into the same
 * ReadableStream. The interface does not change, only the adapter internals.
 */

export interface TtsVoice {
  id: string;
  label: string;
  gender?: 'male' | 'female';
  accent?: string;
}

export interface TtsSynthesis {
  stream: ReadableStream<Uint8Array>;
  mimeType: string;
  sampleRate: number;
}

export interface TtsProvider {
  readonly id: string;
  listVoices(): Promise<TtsVoice[]>;
  synthesize(req: { text: string; voiceId: string }): Promise<TtsSynthesis>;
}
