import 'server-only';
import type { TtsProvider, TtsSynthesis, TtsVoice } from './types';
import { ProviderError } from '../errors';
import { env, requireEnv } from '@/lib/env';

/**
 * PRD §3.2 — Speechmatics TTS (preview).
 *
 *   POST https://preview.tts.speechmatics.com/generate/<voice_id>
 *   Authorization: Bearer <API_KEY>
 *   { "text": "..." }
 *   → streamed WAV
 *
 * The response body is handed straight through as a ReadableStream so playback
 * can start before synthesis finishes. Nothing is buffered here — buffering
 * would add the whole synthesis time to first-audio latency and would breach
 * the Vercel streaming rule in PRD §3.1.
 *
 * Preview has no SLA (PRD §16). A second TTS adapter must exist before any
 * live demo.
 */

const VOICES: TtsVoice[] = [
  { id: 'theo', label: 'Theo', gender: 'male', accent: 'British' },
  { id: 'sarah', label: 'Sarah', gender: 'female', accent: 'British' },
  { id: 'jack', label: 'Jack', gender: 'male', accent: 'American' },
  { id: 'megan', label: 'Megan', gender: 'female', accent: 'American' },
];

export const speechmaticsTts: TtsProvider = {
  id: 'speechmatics',

  async listVoices(): Promise<TtsVoice[]> {
    return VOICES;
  },

  async synthesize({ text, voiceId }): Promise<TtsSynthesis> {
    const apiKey = requireEnv('SPEECHMATICS_API_KEY');
    const voice = VOICES.some((v) => v.id === voiceId) ? voiceId : env.SPEECHMATICS_TTS_VOICE;

    const trimmed = text.trim();
    if (!trimmed) throw new ProviderError('speechmatics', 400, 'Nothing to speak.');

    const response = await fetch(`${env.SPEECHMATICS_TTS_URL}/generate/${voice}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: trimmed }),
      cache: 'no-store',
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new ProviderError('speechmatics', response.status, detail.slice(0, 300));
    }

    return {
      stream: response.body,
      mimeType: response.headers.get('content-type') ?? 'audio/wav',
      sampleRate: 16000,
    };
  },
};
