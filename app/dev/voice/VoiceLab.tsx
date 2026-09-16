'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Badge, Surface } from '@/components/ui/Surface';
import { startCapture, type MicCapture } from '@/lib/audio/capture';
import { playAudioResponse, unlockPlayback, type PlaybackHandle } from '@/lib/audio/playback';
import { sttFactory } from '@/lib/providers/registry.client';
import type { SttSession } from '@/lib/providers/stt/types';

type LogEntry = { at: number; level: 'info' | 'ok' | 'error'; text: string };

const SAMPLE_TEXT =
  'Tell me about a time you had to debug something under pressure. What was the problem, and how did you work out what was going wrong?';

export function VoiceLab() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [voiceId, setVoiceId] = useState('theo');
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [finals, setFinals] = useState<string[]>([]);
  const [level, setLevel] = useState(0);
  const [amplitude, setAmplitude] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);

  const playbackRef = useRef<PlaybackHandle | null>(null);
  const captureRef = useRef<MicCapture | null>(null);
  const sessionRef = useRef<SttSession | null>(null);
  const rafRef = useRef<number | null>(null);

  const say = useCallback((level: LogEntry['level'], text: string) => {
    setLog((prev) => [{ at: Date.now(), level, text }, ...prev].slice(0, 40));
  }, []);

  // ── TTS path ────────────────────────────────────────────────────────────
  async function speak() {
    if (speaking) {
      playbackRef.current?.stop();
      return;
    }
    setSpeaking(true);
    const startedAt = performance.now();

    try {
      await unlockPlayback();
      say('info', `POST /api/tts (${text.trim().length} chars, voice "${voiceId}")`);

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      say('ok', `first byte in ${Math.round(performance.now() - startedAt)}ms`);

      const handle = await playAudioResponse(response, {
        onEnded: () => {
          setSpeaking(false);
          setAmplitude(0);
        },
      });
      playbackRef.current = handle;
      say('ok', `playing — audible in ${Math.round(performance.now() - startedAt)}ms total`);

      // Drives the avatar mouth in the real interview screen (PRD §11.4).
      const tick = () => {
        if (!handle.playing) {
          setAmplitude(0);
          return;
        }
        setAmplitude(handle.amplitude());
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      await handle.finished;
    } catch (e) {
      say('error', e instanceof Error ? e.message : String(e));
      setSpeaking(false);
    }
  }

  // ── STT path ────────────────────────────────────────────────────────────
  async function listen() {
    if (listening) {
      await stopListening();
      return;
    }

    setPartial('');
    setFinals([]);
    setListening(true);

    try {
      say('info', 'GET /api/stt/token');
      const tokenResponse = await fetch('/api/stt/token');
      if (!tokenResponse.ok) {
        const body = (await tokenResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${tokenResponse.status}`);
      }
      const { wsUrl, expiresAt } = (await tokenResponse.json()) as {
        wsUrl: string;
        expiresAt: number;
      };
      say('ok', `token minted, expires in ${Math.round((expiresAt - Date.now()) / 1000)}s`);

      const factory = sttFactory();
      say('info', `opening socket (${factory.id}, ${factory.audioSpec.sampleRate}Hz)`);

      const session = await factory.connect({
        wsUrl,
        language: 'en',
        audioSpec: factory.audioSpec,
        onPartial: (t) => setPartial(t),
        onFinal: (t) => {
          setPartial('');
          setFinals((prev) => [...prev, t]);
        },
        onEndOfTurn: () => say('ok', 'EndOfUtterance — provider says you stopped talking'),
        onError: (e) => say('error', e.message),
        onClose: (code) => say('info', `socket closed (${code})`),
      });
      sessionRef.current = session;
      say('ok', 'recognition started');

      const capture = await startCapture(factory.audioSpec, {
        onFrame: (frame) => session.sendAudio(frame),
        onLevel: setLevel,
        onError: (e) => say('error', e.message),
      });
      captureRef.current = capture;
      say('ok', `mic open at ${capture.sampleRate}Hz — speak now`);
    } catch (e) {
      say('error', e instanceof Error ? e.message : String(e));
      await stopListening();
    }
  }

  const stopListening = useCallback(async () => {
    setListening(false);
    setLevel(0);
    await captureRef.current?.stop();
    captureRef.current = null;
    await sessionRef.current?.close();
    sessionRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      playbackRef.current?.stop();
      void captureRef.current?.stop();
      void sessionRef.current?.close();
    };
  }, []);

  return (
    <div className="flex flex-col gap-10">
      {/* ── TTS ─────────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">Speak this text</h2>
          {speaking && <Badge tone="accent">Playing</Badge>}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            aria-label="Text to speak"
          />
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              aria-label="Voice"
              className="h-10 rounded-lg border border-line bg-raised px-3 text-sm"
            >
              <option value="theo">Theo · British male</option>
              <option value="sarah">Sarah · British female</option>
              <option value="jack">Jack · American male</option>
              <option value="megan">Megan · American female</option>
            </select>
            <Button onClick={() => void speak()} variant={speaking ? 'secondary' : 'primary'}>
              {speaking ? 'Stop' : 'Speak'}
            </Button>
            <Meter label="Output amplitude" value={amplitude} />
          </div>
        </div>
      </section>

      {/* ── STT ─────────────────────────────────────────────────────────── */}
      <section className="border-t border-line pt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">Transcribe me</h2>
          {listening && <Badge tone="accent">Listening</Badge>}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void listen()} variant={listening ? 'secondary' : 'primary'}>
            {listening ? 'Stop listening' : 'Start listening'}
          </Button>
          <Meter label="Mic level" value={level * 4} />
        </div>

        <Surface className="mt-4 min-h-28 p-4">
          {finals.length === 0 && !partial ? (
            <p className="text-sm text-muted">
              Nothing transcribed yet. Confirmed text appears in full contrast, in-progress text in
              grey.
            </p>
          ) : (
            <p className="text-base leading-relaxed">
              {finals.join(' ')}{' '}
              {partial && <span className="text-muted">{partial}</span>}
            </p>
          )}
        </Surface>
      </section>

      {/* ── log ─────────────────────────────────────────────────────────── */}
      <section className="border-t border-line pt-10">
        <h2 className="text-lg font-medium">Log</h2>
        <ul className="mt-4 flex flex-col gap-1 font-mono text-xs">
          {log.length === 0 && <li className="text-muted">No events yet.</li>}
          {log.map((entry) => (
            <li key={`${entry.at}-${entry.text}`} className="flex gap-3">
              <span className="shrink-0 text-muted">
                {new Date(entry.at).toLocaleTimeString([], { hour12: false })}
              </span>
              <span
                className={
                  entry.level === 'error'
                    ? 'text-danger'
                    : entry.level === 'ok'
                      ? 'text-positive'
                      : 'text-muted'
                }
              >
                {entry.text}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">{label}</span>
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-75"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
