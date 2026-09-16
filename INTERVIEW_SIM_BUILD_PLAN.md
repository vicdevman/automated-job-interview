# Automated Job Interview Simulator — Build Plan

> Spec for Claude Code. Drop this at the repo root as `PLAN.md` (or fold into `CLAUDE.md`).
> Everything here is decided unless marked **[CONFIRM]**.

---

## 0. Decisions locked (flag anything you disagree with before Phase 1)

| Area | Decision |
|---|---|
| Framework | Next.js 15+ (App Router), TypeScript strict, React 19 |
| Deployment | **Vercel only.** No separate backend, no monorepo, no VPS. |
| Database | MongoDB Atlas (connection string supplied by you) via official `mongodb` driver + cached client |
| STT (realtime) | Speechmatics Realtime — browser ↔ WSS direct, temp JWT minted server-side |
| TTS | Speechmatics TTS (preview) — proxied through a Next route handler |
| LLM | Groq (start) — question generation, follow-ups, answer scoring |
| Auth | Auth.js (NextAuth) v5, credentials provider, MongoDB adapter |
| Styling | Tailwind v4 + a small hand-rolled component layer. No shadcn dump — see §8. |
| Provider swapping | Registry pattern behind interfaces. New provider = one file + one env var. See §3 and §13. |
| Avatar | Hand-built animated SVG rig, audio-reactive. No paid service. See §8.4. |

**[CONFIRM] before build:** (1) Do candidate accounts need email verification, or is username+password enough for a defence demo? (2) Should the admin be a seeded single account, or a real signup with a role flag? Default assumption: seeded single admin, no email verification.

---

## 1. Architecture — why Vercel-only works

The thing that normally forces a long-running server is "realtime audio," but here nothing needs a persistent server socket:

```
┌──────────────────────── BROWSER ────────────────────────┐
│                                                          │
│  Mic ──▶ AudioWorklet (resample → 16kHz PCM S16LE)       │
│                    │                                     │
│                    ▼                                     │
│         WebSocket ──────────────────────────────┐        │
│                                                  │       │
│  Speaker ◀── WebAudio graph ◀── /api/tts (stream)│       │
│                 │                                │       │
│                 └──▶ AnalyserNode ──▶ Avatar     │       │
└──────────────────────────────────────────────────┼───────┘
                          │                        │
          ┌───────────────┼────────────────┐       │
          ▼               ▼                ▼       ▼
   /api/stt/token   /api/tts        /api/interview/*   wss://eu.rt.speechmatics.com
   (mint JWT)    (proxy+stream)   (LLM, scoring, DB)   (direct from browser)
          │               │                │
          └───────────────┴────────────────┘
                   Vercel serverless
                          │
                          ▼
                   MongoDB Atlas
```

**The key facts from the Speechmatics docs that make this work:**

- Temporary keys exist: `POST https://mp.speechmatics.com/v1/api_keys?type=rt` with your real API key in the `Authorization` header and body `{"ttl": <60-86400>}`. Response is `{ "apikey_id": ..., "key_value": "eyJhbG..." }`.
- The browser then connects to `wss://eu.rt.speechmatics.com/v2?jwt=<TEMP_KEY>` — the JWT goes as a **query param**, not a header (browsers can't set WS headers).
- `global.rt.speechmatics.com` auto-routes to the nearest region for lowest latency. **Use `global`** — you're in Nigeria, EU pinning would be slower for no reason.
- `client_ref` is ignored for `rt` tokens (it's batch-only), so don't bother sending it for STT.
- TTS is a plain HTTP `POST https://preview.tts.speechmatics.com/generate/<voice_id>` with `Authorization: Bearer <API_KEY>`, body `{"text": "..."}`. It streams — you can play audio before the response completes. It is **free during preview**.

So: the mic stream never touches our server. Only tokens, LLM calls, scoring, and DB writes do — all short-lived request/response work that serverless handles fine.

**Vercel caveats to respect:**
- Set `export const maxDuration = 60` on `/api/tts` and any streaming LLM route. Enable Fluid Compute on the project.
- Route handlers that stream must return a `ReadableStream`, not buffer the whole body.
- `export const runtime = 'nodejs'` on anything touching MongoDB (the driver isn't edge-compatible).

---

## 2. The realtime voice loop

This is the part worth getting right. Turn-by-turn, with barge-in.

### 2.1 Session lifecycle

```
1. Candidate picks role + level → POST /api/interview/start
   → LLM generates opening question set → session doc created in Mongo
   → returns { sessionId, firstQuestion }

2. Client requests STT token → GET /api/stt/token → { token, wsUrl, expiresAt }

3. Client opens WS to Speechmatics, sends StartRecognition with:
   {
     transcription_config: {
       language: "en",
       operating_point: "enhanced",
       max_delay: 0.7,
       enable_partials: true,
       conversation_config: { end_of_utterance_silence_trigger: 0.8 }
     },
     audio_format: { type: "raw", encoding: "pcm_s16le", sample_rate: 16000 }
   }

4. AGENT TURN: client POSTs question text to /api/tts → streams WAV back
   → decode → play through WebAudio → AnalyserNode drives avatar mouth
   → mic is muted-but-connected during playback (keep WS alive with silence
     frames so the session doesn't time out)

5. CANDIDATE TURN: unmute mic, stream PCM frames over WS
   → partials render as live grey text (<500ms)
   → finals replace them as confirmed black text (~0.7–2s)
   → EndOfUtterance message OR explicit "Done answering" button ends the turn

6. POST /api/interview/turn with { sessionId, questionId, transcript, timings }
   → LLM scores the answer + decides the next question (adaptive follow-up)
   → deterministic metrics computed server-side (WPM, fillers, latency)
   → turn doc written to Mongo
   → returns { scores, feedback, nextQuestion | null }

7. Loop to step 4 until nextQuestion is null
   → POST /api/interview/finish → aggregate → results page
```

### 2.2 Barge-in

If the analyser detects candidate speech (or the user hits the mic button) while TTS is playing: stop the `AudioBufferSourceNode`, unmute, switch to listening. This one behaviour is what makes it feel like a real call instead of a kiosk.

### 2.3 Turn detection

Speechmatics ships `EndOfUtterance` detection — use it as the primary signal that the candidate finished, with a visible "Done answering" button as the manual override. Don't rely on silence timers you wrote yourself.

### 2.4 Keeping the WS alive

Speechmatics sessions have idle limits. During the agent's TTS turn, keep sending silent PCM frames rather than closing and reopening the socket — reconnecting per question adds ~300ms+ of dead air and burns tokens.

---

## 3. Provider abstraction

The whole point: swapping STT, TTS, or LLM = write one adapter file, change one env var. Nothing in `app/` or `components/` ever imports a vendor SDK directly.

### 3.1 STT — two halves

STT is special because the realtime session runs in the **browser** but the credential must be minted on the **server**. So every STT provider implements two interfaces.

```ts
// lib/providers/stt/types.ts

/** SERVER half — runs in a route handler, holds the secret key. */
export interface SttTokenIssuer {
  readonly id: string;
  issueToken(opts: { ttlSeconds: number }): Promise<{
    token: string;
    wsUrl: string;      // provider decides the URL shape, incl. how the token is attached
    expiresAt: number;  // epoch ms
  }>;
}

/** CLIENT half — runs in the browser, never sees the secret. */
export interface SttSessionFactory {
  readonly id: string;
  readonly audioSpec: { sampleRate: number; encoding: 'pcm_s16le'; frameSize: number };
  connect(opts: {
    wsUrl: string;
    language: string;
    onPartial: (text: string) => void;
    onFinal: (text: string, meta: { startTime: number; endTime: number }) => void;
    onEndOfTurn: () => void;
    onError: (err: Error) => void;
    onClose: (code: number) => void;
  }): Promise<SttSession>;
}

export interface SttSession {
  sendAudio(frame: ArrayBuffer): void;
  sendSilence(ms: number): void;
  close(): Promise<void>;
  readonly state: 'connecting' | 'open' | 'closed';
}
```

`audioSpec` on the factory is important — it lets the AudioWorklet configure itself from the provider rather than hardcoding 16kHz. A provider that wants 24kHz just declares it.

### 3.2 TTS

```ts
// lib/providers/tts/types.ts
export interface TtsVoice { id: string; label: string; gender?: 'male' | 'female'; accent?: string }

export interface TtsProvider {
  readonly id: string;
  listVoices(): Promise<TtsVoice[]>;
  synthesize(req: { text: string; voiceId: string }): Promise<{
    stream: ReadableStream<Uint8Array>;
    mimeType: string;    // 'audio/wav'
    sampleRate: number;
  }>;
}
```

### 3.3 LLM

```ts
// lib/providers/llm/types.ts
export interface LlmProvider {
  readonly id: string;
  readonly defaultModel: string;
  /** Must support JSON-only output — every call in this app is structured. */
  complete<T>(req: {
    system: string;
    user: string;
    model?: string;
    temperature?: number;
    jsonSchema?: object;   // providers that support native structured output use it
  }): Promise<T>;
}
```

Every LLM call in this app returns JSON. No free-text parsing anywhere. The adapter is responsible for stripping code fences if the provider is sloppy about it.

### 3.4 Registry

```ts
// lib/providers/registry.ts
import { speechmaticsTokenIssuer } from './stt/speechmatics.server';
import { speechmaticsTts }        from './tts/speechmatics';
import { groqLlm }                from './llm/groq';

const STT_ISSUERS = { speechmatics: speechmaticsTokenIssuer } as const;
const TTS         = { speechmatics: speechmaticsTts } as const;
const LLM         = { groq: groqLlm } as const;

function pick<T>(map: Record<string, T>, key: string | undefined, kind: string): T {
  const chosen = map[key ?? ''];
  if (!chosen) throw new Error(
    `Unknown ${kind} provider "${key}". Available: ${Object.keys(map).join(', ')}`
  );
  return chosen;
}

export const sttIssuer = () => pick(STT_ISSUERS, process.env.STT_PROVIDER, 'STT');
export const tts       = () => pick(TTS,         process.env.TTS_PROVIDER, 'TTS');
export const llm       = () => pick(LLM,         process.env.LLM_PROVIDER, 'LLM');
```

Client-side STT factories get a parallel `registry.client.ts` keyed off `NEXT_PUBLIC_STT_PROVIDER`.

**Rule for Claude Code: if you ever `import` from `groq-sdk`, `@speechmatics/*`, or any vendor package outside `lib/providers/<kind>/<vendor>.ts`, that's a bug. Fix it rather than working around it.**

---

## 4. Repo structure

Single Next.js app. No workspaces.

```
/
├── app/
│   ├── (marketing)/page.tsx            # landing
│   ├── (auth)/login/, /register/
│   ├── (app)/
│   │   ├── dashboard/page.tsx          # past sessions, progress
│   │   ├── setup/page.tsx              # pick role + level + voice, mic test
│   │   ├── interview/[sessionId]/page.tsx   # THE screen
│   │   └── results/[sessionId]/page.tsx
│   ├── admin/
│   │   ├── roles/                      # CRUD roles + descriptions
│   │   ├── questions/                  # view/edit generated question sets
│   │   └── sessions/                   # monitor candidates
│   └── api/
│       ├── stt/token/route.ts
│       ├── tts/route.ts
│       ├── interview/start/route.ts
│       ├── interview/turn/route.ts
│       ├── interview/finish/route.ts
│       ├── report/[sessionId]/route.ts # PDF
│       └── admin/...
├── lib/
│   ├── providers/
│   │   ├── stt/{types.ts, speechmatics.server.ts, speechmatics.client.ts, registry*.ts}
│   │   ├── tts/{types.ts, speechmatics.ts}
│   │   └── llm/{types.ts, groq.ts}
│   ├── audio/
│   │   ├── capture.ts                  # getUserMedia + worklet wiring
│   │   ├── pcm-worklet.ts              # resample → PCM S16LE frames
│   │   └── playback.ts                 # decode, play, AnalyserNode taps
│   ├── interview/
│   │   ├── prompts.ts                  # ALL prompt templates live here, nowhere else
│   │   ├── scoring.ts                  # deterministic metrics (pure functions)
│   │   └── orchestrator.ts             # turn state machine
│   ├── db/{client.ts, models.ts, repositories/*.ts}
│   └── env.ts                          # zod-validated env, fails loudly at boot
├── components/
│   ├── avatar/InterviewerAvatar.tsx
│   ├── interview/{TranscriptPane, MicButton, TurnIndicator, ProgressRail}.tsx
│   └── ui/                             # buttons, fields, cards — hand-rolled
└── public/
```

---

## 5. Data model (MongoDB)

```ts
// users
{ _id, email, name, passwordHash, role: 'candidate' | 'admin', createdAt }

// roles  (admin-managed; this is what the LLM generates questions from)
{ _id, title, description, competencies: string[], levels: ('junior'|'mid'|'senior')[],
  createdBy, createdAt, updatedAt }

// questionSets  (cached LLM output — regenerate on demand, don't call LLM per session)
{ _id, roleId, level, questions: [
    { id, text, competency, expectedPoints: string[], difficulty }
  ], generatedBy: { provider, model }, generatedAt }

// sessions
{ _id, userId, roleId, level, voiceId,
  status: 'in_progress' | 'completed' | 'abandoned',
  startedAt, completedAt, durationSec,
  overallScore, subScores: { relevance, clarity, structure, pace },
  summary, strengths: string[], improvements: string[] }

// turns  (one per question answered)
{ _id, sessionId, index, questionId, questionText, isFollowUp,
  transcript, partialCount,
  timings: { questionSpokenAt, answerStartedAt, answerEndedAt, thinkingTimeMs, speakingTimeMs },
  metrics: { wordCount, wpm, fillerCount, fillerRate },
  scores: { relevance, clarity, structure, pace, total },
  feedback: string,
  llm: { provider, model, latencyMs } }
```

Indexes: `sessions.userId`, `turns.sessionId`, `questionSets.{roleId, level}` compound.

Storing `llm.provider`/`model` per turn matters — when you swap Groq for something else mid-project, you can still explain old results.

---

## 6. API routes

| Route | Method | Does |
|---|---|---|
| `/api/stt/token` | GET | Auth check → `sttIssuer().issueToken({ ttlSeconds: 300 })` → `{ token, wsUrl, expiresAt }`. Never returns the real key. |
| `/api/tts` | POST | `{ text, voiceId }` → `tts().synthesize()` → stream bytes back with correct `Content-Type`. `maxDuration = 60`. |
| `/api/interview/start` | POST | `{ roleId, level, voiceId }` → load-or-generate question set → create session → return `{ sessionId, firstQuestion }` |
| `/api/interview/turn` | POST | `{ sessionId, questionId, transcript, timings }` → deterministic metrics + LLM score + next-question decision → persist turn → return `{ scores, feedback, nextQuestion }` |
| `/api/interview/finish` | POST | Aggregate turns → session summary via LLM → return results payload |
| `/api/report/[sessionId]` | GET | PDF via `@react-pdf/renderer` (works on Vercel nodejs runtime) |
| `/api/admin/roles` | CRUD | Role management |
| `/api/admin/questions/generate` | POST | `{ roleId, level }` → regenerate + cache question set |

---

## 7. Scoring engine

Split deliberately into two halves so you can explain both — and so the LLM can't be blamed for everything.

### 7.1 Deterministic (pure TS, `lib/interview/scoring.ts`, unit-tested)

- `wordCount`, `speakingTimeMs` → **WPM**
- **Pace score**: 100 inside 120–160 WPM, falling off linearly outside the band (this is the exact band from the project doc, so it maps to Chapter 4.7)
- **Filler rate**: count of `um, uh, like, you know, basically, actually, sort of, kind of` ÷ wordCount
- **Thinking time**: gap between question end and answer start

### 7.2 LLM-judged (`lib/interview/prompts.ts`)

One call per turn, JSON-only, returning:

```json
{
  "relevance": 0-100,
  "clarity": 0-100,
  "structure": 0-100,
  "feedback": "two sentences, specific, addressed to the candidate",
  "coveredPoints": ["..."],
  "missedPoints": ["..."],
  "nextQuestion": { "text": "...", "isFollowUp": true, "competency": "..." } | null
}
```

`structure` is where STAR-method adherence gets judged for behavioural questions.

### 7.3 Final aggregate

```
turnScore = 0.40*relevance + 0.25*clarity + 0.20*structure + 0.15*paceScore
sessionScore = mean(turnScores)
```

Weights live in one exported const so they're trivially tunable and easy to defend.

---

## 8. UI/UX direction

The brief is "modern SaaS, clean, easy to operate." The trap is the generic SaaS-card kit — everything chopped into identical rounded cards with the same soft shadow. Avoid that. Specific direction:

### 8.1 Concept

An interview is a stressful moment. The interface should feel **composed and quiet**, not busy. One focal point per screen. The interview screen in particular should have almost no chrome — the avatar and the live transcript are the entire UI.

### 8.2 Tokens

```
Surface     #0F1115   deep neutral, not tinted black
Raised      #171A20
Line        #262B34
Text        #E8EAED
Muted       #8A929E
Accent      #4F7CFF   (calm blue — signals "listening", used sparingly)
Positive    #3FBF8F
Warn        #E0A030
```

Dark by default with a light mode toggle. Dark reduces glare during a long session and makes the avatar read as the focal point.

Type: **Geist** or **Inter Tight** for UI, single family, three weights (400/500/600). One family is enough — don't pair a display serif in here, it fights the product's job. Type scale 14 / 16 / 20 / 28 / 40.

### 8.3 Interview screen layout

```
┌──────────────────────────────────────────────────┐
│  ● Software Engineer · Mid          Q3 of 6   ✕  │   ← thin status rail
├──────────────────────────────────────────────────┤
│                                                  │
│                  ╭──────────╮                    │
│                  │  AVATAR  │                    │   ← focal point
│                  ╰──────────╯                    │
│         "Tell me about a time you had to         │   ← current question,
│          debug something under pressure."           large, quiet
│                                                  │
│   ┌────────────────────────────────────────┐     │
│   │ I once had a production issue where…   │     │   ← live transcript
│   │ the database connections were█         │     │     grey=partial
│   └────────────────────────────────────────┘     │     white=final
│                                                  │
│            ◉ Listening          [ Done ]         │
└──────────────────────────────────────────────────┘
```

State is communicated by **one** indicator that changes: `Speaking` (avatar animating, mic dimmed) → `Listening` (waveform ring around mic) → `Thinking` (subtle pulse). Never show three status elements at once.

Motion: restrained. The avatar animates because it's speaking — that's functional, not decorative. Don't add fade-up entrances on every section.

### 8.4 The avatar

"A more alive DiceBear." Build it as a **hand-rolled SVG rig** — free, no dependency, full control:

- Base: a DiceBear-style geometric face (head, hair block, eyes, brows, mouth) as inline SVG with parameterised paths
- **Mouth**: driven by `AnalyserNode.getByteFrequencyData()` on the TTS playback node. Map RMS amplitude → mouth-open height. This is the thing that sells "alive" — mouth movement synced to actual audio, not a loop.
- **Blink**: random interval 2–6s, 120ms close/open
- **Idle sway**: 4s ease-in-out translate of ±2px on the head group, plus slow brow drift
- **Listening state**: head tilts ~3°, brows raise slightly, eyes track a subtle point
- **Thinking state**: eyes glance up-left, brows furrow

Implement with Framer Motion for the discrete state transitions and a `requestAnimationFrame` loop for the amplitude-driven mouth. Keep all of it in `components/avatar/InterviewerAvatar.tsx` with a clean prop API: `{ state: 'idle'|'speaking'|'listening'|'thinking', amplitude: number, seed: string }`.

Respect `prefers-reduced-motion`: drop idle sway and blink, keep mouth sync only.

---

## 9. Environment variables

```bash
# --- core ---
MONGODB_URI=
MONGODB_DB=interview_sim
AUTH_SECRET=
NEXTAUTH_URL=

# --- provider selection (this is the swap surface) ---
STT_PROVIDER=speechmatics
NEXT_PUBLIC_STT_PROVIDER=speechmatics
TTS_PROVIDER=speechmatics
LLM_PROVIDER=groq

# --- speechmatics ---
SPEECHMATICS_API_KEY=
SPEECHMATICS_RT_URL=wss://global.rt.speechmatics.com/v2
SPEECHMATICS_MP_URL=https://mp.speechmatics.com/v1
SPEECHMATICS_TTS_URL=https://preview.tts.speechmatics.com
SPEECHMATICS_TTS_VOICE=theo        # sarah | theo | megan | jack

# --- groq ---
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

# --- tuning ---
STT_TOKEN_TTL_SECONDS=300
INTERVIEW_QUESTION_COUNT=6
```

Validate all of this in `lib/env.ts` with zod at module load. A missing key should fail at boot with a readable message, not at 2am mid-demo.

---

## 10. Your checklist (do these before Claude Code starts)

1. **Speechmatics API key** — portal.speechmatics.com → Settings → API Keys. One key covers both STT and TTS.
2. **Groq API key** — console.groq.com. Free tier is generous and fast.
3. **MongoDB Atlas** — free M0 cluster, whitelist `0.0.0.0/0` (Vercel has no static IPs), grab the connection string.
4. **Vercel project** — link the repo, enable Fluid Compute, paste the env vars.
5. **Decide the two [CONFIRM] items in §0.**
6. Optional: pick the default voice by listening to all four (`sarah`, `theo`, `megan`, `jack`). `theo` (UK male) reads as the most neutral "interviewer."

---

## 11. Build phases for Claude Code

Build in this order. Each phase ends in something runnable — don't let it write the whole app then debug.

**Phase 1 — Skeleton + provider contracts**
Next.js app, Tailwind, `lib/env.ts`, all three `types.ts` interfaces, the registry, empty adapter stubs that throw `NotImplemented`. Mongo client + models. Auth.js login/register. Ship a dashboard that says "no sessions yet."

**Phase 2 — Voice I/O in isolation**
Build `/dev/voice` — a throwaway page with two buttons: "Speak this text" (TTS path) and "Transcribe me" (STT path). Get both working standalone before touching interview logic. This is where 80% of the debugging lives; isolate it.
Implement: `speechmatics.server.ts` (token), `speechmatics.client.ts` (WS session), `pcm-worklet.ts`, `playback.ts`, `/api/stt/token`, `/api/tts`.

**Phase 3 — LLM + scoring**
`groq.ts` adapter, `prompts.ts`, `scoring.ts` with unit tests for the deterministic metrics. Wire `/api/interview/*`. Test the whole loop with **typed** answers only — no audio. Prove the brain works before adding the mouth.

**Phase 4 — The interview screen**
Orchestrator state machine, transcript pane, mic button, turn indicator, barge-in. Connect Phase 2 to Phase 3.

**Phase 5 — Avatar**
The SVG rig, amplitude binding, state transitions.

**Phase 6 — Results + admin + PDF**
Results page with score breakdown and radar chart (Recharts), session history, admin role/question CRUD, PDF export.

**Phase 7 — Polish + deploy**
Mic permission handling, network-drop recovery, empty states, loading states, mobile layout, deploy to Vercel, smoke test on a real Nigerian connection.

---

## 12. Mapping to his chapters (so he can defend it)

| Chapter | Requirement | How this build satisfies it |
|---|---|---|
| 1.3 obj. 1 | Voice-driven interaction (WebRTC/Whisper) | Speechmatics realtime WS + WebAudio. Note in his doc: provider swapped from Whisper to Speechmatics, same architecture. |
| 1.3 obj. 2 | LLM question generation | Groq, question sets generated per role+level, adaptive follow-ups |
| 1.3 obj. 3 | Multi-modal analysis | **Partially** — verbal (LLM) + vocal pace/fillers. Facial/CNN-LSTM is out of scope; already listed in his Chapter 5 as future work. |
| 1.3 obj. 4 | Adaptive questioning | LLM decides follow-up vs next question per turn |
| 1.3 obj. 5 | Real-time feedback | Partials render live; per-turn scores returned immediately |
| 1.3 obj. 6 | Progress tracking | Dashboard, sessions collection |
| 3.5 / Fig 3.4 | User + admin flows | Matches the flowchart exactly — login → start → receive → answer → submit → feedback → results → logout, admin CRUD side |
| 4.2 | 3-tier architecture | Presentation (React) / Logic (route handlers) / Data (MongoDB) — still three tiers, just serverless |
| 4.3 | Stated Python backend | **Deviation.** Next.js route handlers instead. He should update 4.3 and 4.10 — easy edit, defensible as "unified TypeScript runtime reduces latency and deployment complexity." |
| 4.5 | Relational tables | **Deviation.** MongoDB document model replaces the SQL tables. He must rewrite 4.4/4.5 as collections. Flag this to him early — it's the biggest doc change. |
| 4.7 | Scoring formula | Deterministic pace band (120–160 WPM) kept verbatim; keyword coverage upgraded to LLM relevance scoring. Document the new weights. |

**Tell him about the 4.3/4.5 deviations before you start building**, not after. Chapter edits are cheap now, expensive after his supervisor has signed off.

---

## 13. Adding a new provider (the 2-minute test)

This is the acceptance criterion for the abstraction. Swapping Speechmatics TTS for ElevenLabs should be:

1. Create `lib/providers/tts/elevenlabs.ts` implementing `TtsProvider`
2. Add one line to the `TTS` map in `registry.ts`
3. Set `TTS_PROVIDER=elevenlabs` + `ELEVENLABS_API_KEY=` in env
4. Add the key to the zod schema in `lib/env.ts`

Nothing else changes. No component edits, no route edits.

**Have Claude Code prove it in Phase 3** by writing a second LLM adapter (OpenAI or Gemini) alongside Groq — even if you never use it. If writing the second adapter requires touching anything outside those four places, the abstraction is wrong and it's cheaper to fix then than later.

---

## 14. Known risks

| Risk | Mitigation |
|---|---|
| Speechmatics TTS is **preview** — no SLA, pricing unannounced, may change | Provider abstraction means a swap is cheap. Don't demo on preview-only without a tested fallback adapter. |
| TTS has no bidirectional streaming yet | Fine for turn-based interviews. Keep question text short for low first-byte latency (<200ms per docs). |
| Nigerian network latency / drops | Reconnect logic on the WS with exponential backoff; persist turns immediately so a drop never loses a completed answer. |
| Vercel function timeout on long LLM calls | `maxDuration = 60`, stream where possible, keep prompts tight. |
| Accent accuracy | Speechmatics handles African English reasonably; test early with real recordings. If weak, `custom_dictionary` can boost domain terms. |
