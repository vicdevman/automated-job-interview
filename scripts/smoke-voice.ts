/**
 * End-to-end smoke test for the voice path (PRD §14, Phase 2) with no browser.
 *
 * It closes the loop on itself: synthesise a known sentence through the TTS
 * provider, decode the WAV it returns, feed that PCM into the realtime STT
 * socket exactly as the AudioWorklet would, and check the transcript comes back
 * resembling what we asked it to say.
 *
 * That exercises every piece the interview screen depends on — token minting,
 * the WebSocket protocol, frame sizing, partials and finals — so a failure here
 * is a provider problem, not an interview-logic problem.
 *
 *   npm run smoke:voice
 */
import { speechmaticsIssuer } from '@/lib/providers/stt/speechmatics.server';
import { speechmaticsTts } from '@/lib/providers/tts/speechmatics';

const SENTENCE =
  'Tell me about a time you had to debug something under pressure.';

const FRAME_SAMPLES = 1024;
const TARGET_RATE = 16000;

interface Wav {
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
  samples: Int16Array;
}

/** Minimal RIFF/WAVE parser — enough for the PCM the TTS provider returns. */
function parseWav(buf: Buffer): Wav {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE payload.');
  }

  let offset = 12;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let channels = 0;
  let data: Buffer | null = null;

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = buf.subarray(offset + 8, offset + 8 + size);

    if (id === 'fmt ') {
      channels = body.readUInt16LE(2);
      sampleRate = body.readUInt32LE(4);
      bitsPerSample = body.readUInt16LE(14);
    } else if (id === 'data') {
      data = body;
    }
    // Chunks are word-aligned.
    offset += 8 + size + (size % 2);
  }

  if (!data || !sampleRate) throw new Error('WAV had no data or fmt chunk.');
  if (bitsPerSample !== 16) throw new Error(`Expected 16-bit PCM, got ${bitsPerSample}-bit.`);

  const samples = new Int16Array(data.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2);

  return { sampleRate, bitsPerSample, channels, samples };
}

/** Mixes to mono and resamples to 16kHz, the same job the worklet does. */
function toMono16k(wav: Wav): Int16Array {
  let mono: Int16Array;
  if (wav.channels > 1) {
    const frames = Math.floor(wav.samples.length / wav.channels);
    mono = new Int16Array(frames);
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let c = 0; c < wav.channels; c++) sum += wav.samples[i * wav.channels + c] ?? 0;
      mono[i] = Math.round(sum / wav.channels);
    }
  } else {
    mono = wav.samples;
  }

  if (wav.sampleRate === TARGET_RATE) return mono;

  const ratio = wav.sampleRate / TARGET_RATE;
  const out = new Int16Array(Math.floor(mono.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = mono[idx] ?? 0;
    const b = mono[idx + 1] ?? a;
    out[i] = Math.round(a + (b - a) * frac);
  }
  return out;
}

const normalise = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

function wordOverlap(expected: string, actual: string): number {
  const want = new Set(normalise(expected).split(' '));
  const got = new Set(normalise(actual).split(' '));
  if (want.size === 0) return 0;
  let hits = 0;
  for (const w of want) if (got.has(w)) hits++;
  return hits / want.size;
}

async function main() {
  console.log('── 1. synthesise ──────────────────────────────────────────');
  console.log(`   text: "${SENTENCE}"`);

  const ttsStart = Date.now();
  const synthesis = await speechmaticsTts.synthesize({ text: SENTENCE, voiceId: 'theo' });

  const chunks: Uint8Array[] = [];
  let firstByteAt = 0;
  for await (const chunk of synthesis.stream as unknown as AsyncIterable<Uint8Array>) {
    if (!firstByteAt) firstByteAt = Date.now();
    chunks.push(chunk);
  }
  const audio = Buffer.concat(chunks);

  console.log(`   ✓ ${audio.length} bytes, ${synthesis.mimeType}`);
  console.log(`   ✓ first byte in ${firstByteAt - ttsStart}ms, complete in ${Date.now() - ttsStart}ms`);

  const wav = parseWav(audio);
  const pcm = toMono16k(wav);
  const durationSec = pcm.length / TARGET_RATE;
  console.log(
    `   ✓ decoded ${wav.sampleRate}Hz/${wav.bitsPerSample}-bit/${wav.channels}ch ` +
      `→ ${TARGET_RATE}Hz mono, ${durationSec.toFixed(2)}s`,
  );

  console.log('\n── 2. mint a realtime token ───────────────────────────────');
  const token = await speechmaticsIssuer.issueToken({ ttlSeconds: 300 });
  console.log(`   ✓ token issued, expires in ${Math.round((token.expiresAt - Date.now()) / 1000)}s`);
  console.log(`   ✓ wsUrl: ${token.wsUrl.split('?')[0]}?jwt=<redacted>`);

  console.log('\n── 3. stream it back through STT ──────────────────────────');
  const partials: string[] = [];
  const finals: string[] = [];
  let endOfUtterance = false;
  let firstPartialAt = 0;
  const sttStart = Date.now();

  const transcript = await new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(token.wsUrl);
    socket.binaryType = 'arraybuffer';

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out waiting for the transcript.'));
    }, 60_000);

    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error('WebSocket error.'));
    };

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          message: 'StartRecognition',
          audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: TARGET_RATE },
          transcription_config: {
            language: 'en',
            operating_point: 'enhanced',
            max_delay: 0.7,
            enable_partials: true,
            conversation_config: { end_of_utterance_silence_trigger: 0.8 },
          },
        }),
      );
    };

    socket.onmessage = async (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      const msg = JSON.parse(event.data) as {
        message: string;
        metadata?: { transcript?: string };
        reason?: string;
        type?: string;
      };

      switch (msg.message) {
        case 'RecognitionStarted': {
          console.log('   ✓ RecognitionStarted');
          let seq = 0;
          // Paced at roughly real time so the provider's endpointing behaves the
          // way it will with a live microphone.
          for (let i = 0; i < pcm.length; i += FRAME_SAMPLES) {
            const frame = pcm.subarray(i, Math.min(i + FRAME_SAMPLES, pcm.length));
            socket.send(new Int16Array(frame).buffer);
            seq++;
            await new Promise((r) => setTimeout(r, (FRAME_SAMPLES / TARGET_RATE) * 1000));
          }
          // Trailing silence so end-of-utterance can trigger (0.8s threshold,
          // so ~3.8s of silence gives it room before we end the stream).
          for (let i = 0; i < 60; i++) {
            socket.send(new Int16Array(FRAME_SAMPLES).buffer);
            seq++;
            await new Promise((r) => setTimeout(r, (FRAME_SAMPLES / TARGET_RATE) * 1000));
          }
          console.log(`   ✓ sent ${seq} frames`);
          socket.send(JSON.stringify({ message: 'EndOfStream', last_seq_no: seq }));
          break;
        }
        case 'AddPartialTranscript': {
          const t = msg.metadata?.transcript ?? '';
          if (t.trim()) {
            if (!firstPartialAt) {
              firstPartialAt = Date.now();
              console.log(`   ✓ first partial after ${firstPartialAt - sttStart}ms`);
            }
            partials.push(t);
          }
          break;
        }
        case 'AddTranscript': {
          const t = msg.metadata?.transcript ?? '';
          if (t.trim()) finals.push(t);
          break;
        }
        case 'EndOfUtterance':
          endOfUtterance = true;
          console.log('   ✓ EndOfUtterance received');
          break;
        case 'EndOfTranscript':
          clearTimeout(timer);
          socket.close();
          resolve(finals.join(' ').trim());
          break;
        case 'Error':
          clearTimeout(timer);
          socket.close();
          reject(new Error(`${msg.type}: ${msg.reason}`));
          break;
        default:
          break;
      }
    };
  });

  console.log('\n── 4. result ──────────────────────────────────────────────');
  console.log(`   spoken:     "${SENTENCE}"`);
  console.log(`   transcript: "${transcript}"`);
  console.log(`   partials received: ${partials.length}`);
  console.log(`   end-of-utterance:  ${endOfUtterance ? 'yes' : 'no'}`);

  const overlap = wordOverlap(SENTENCE, transcript);
  console.log(`   word overlap:      ${(overlap * 100).toFixed(0)}%`);

  if (overlap < 0.7) {
    console.error('\n✗ FAILED — transcript does not match what was spoken.');
    process.exit(1);
  }
  console.log('\n✓ Voice loop verified: TTS → PCM → STT round-trips correctly.');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗ Smoke test failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
