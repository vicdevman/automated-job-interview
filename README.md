# Automated Job Interview Simulator

A web application that conducts a **spoken mock job interview**. A candidate supplies their CV, picks
a target role, and holds a real voice conversation with an AI interviewer that asks questions
grounded in their actual background. The system listens, transcribes, scores, adapts its next
question to what was just said, and produces a performance report.

Built to `PRD.md`. That document is the specification; this one is how to run it.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill in the keys below
npm run seed                   # indexes, starter roles, the interviewer account
npm run dev                    # http://localhost:3000
```

### Keys you need

| Variable | Where from | Needed for |
|---|---|---|
| `MONGODB_URI` | [Atlas](https://cloud.mongodb.com) free M0 cluster. Whitelist `0.0.0.0/0` — Vercel has no static IPs. | Everything |
| `SPEECHMATICS_API_KEY` | [portal.speechmatics.com](https://portal.speechmatics.com) → Settings → API Keys. One key covers STT **and** TTS. | Voice |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) | Question generation, scoring |
| `AUTH_SECRET` | `openssl rand -base64 32` | Sessions |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` (must decode to exactly 32 bytes) | Field encryption |
| `TAVILY_API_KEY` | [tavily.com](https://tavily.com) — optional | Company research only |

`lib/env.ts` validates every variable at boot with zod. A missing one fails immediately with a
readable message rather than at 2am mid-demo.

---

## Verifying it works

Four smoke tests. Each one is also the evidence for a specific acceptance criterion in PRD §15, so
they double as defence material — run them in front of an examiner.

```bash
npm test                  # 121 unit tests: scoring, difficulty, grounding, crypto, SSRF, injection
npm run smoke:voice       # TTS → PCM → STT round trip. No browser needed.
npm run smoke:brain       # CV → facts → questions → scoring, against the live LLM
npm run smoke:interview   # a full 6-question interview through the real HTTP API
npm run smoke:privacy     # encryption at rest and hard deletion, checked in Atlas
npm run smoke             # all four in sequence
```

The three that hit the network need `npm run dev` running in another terminal (except
`smoke:voice` and `smoke:brain`, which call the providers directly).

What each one proves:

| Script | Proves |
|---|---|
| `smoke:voice` | Token minting, the WebSocket protocol, frame sizing, partials, end-of-utterance. Reports real first-byte and transcript latency. |
| `smoke:brain` | Every fact traces to a verbatim CV span; a prompt injection in the CV changes nothing; strong answers outscore weak ones; difficulty moves. |
| `smoke:interview` | The whole loop end to end through auth, the route handlers, MongoDB and encryption. |
| `smoke:privacy` | Criterion 7 (unreadable in Atlas) and criterion 8 (deletion leaves no trace in any collection). |

There is also a throwaway harness at **`/dev/voice`** — two buttons, "speak this text" and
"transcribe me", with a live log. If voice misbehaves in a real interview, check there first; it
isolates the audio path from all interview logic.

---

## Architecture

One Next.js app on Vercel. No separate backend, no monorepo.

That works because **the realtime audio never touches our infrastructure**. Speechmatics issues a
short-lived JWT server-side; the browser attaches it to the WebSocket URL as a query parameter
(browsers cannot set WebSocket headers) and streams microphone audio straight to the vendor. Our
serverless functions only ever do short request/response work: mint tokens, proxy TTS, call the LLM,
write to Mongo.

```
┌──────────────────── BROWSER ────────────────────┐
│  Mic ─▶ AudioWorklet ─▶ PCM S16LE ─▶ WebSocket ──┼──▶ Speechmatics (direct)
│  Speaker ◀─ WebAudio ◀─ /api/tts ───────────────┼──▶ (via our proxy)
│                │                                 │
│                └─▶ AnalyserNode ─▶ Avatar mouth  │
└─────────────────────────┬───────────────────────┘
                          ▼
        /api/stt/token · /api/tts · /api/interview/* · /api/profile/*
                    Vercel serverless (nodejs runtime)
                          ▼
                    MongoDB Atlas
```

### The one architectural rule

**No file under `app/`, `components/` or `lib/interview/` may import a vendor SDK.** Every external
capability sits behind an interface in `lib/providers/<kind>/types.ts`, is implemented in
`lib/providers/<kind>/<vendor>.ts`, and is chosen by an environment variable through
`lib/providers/registry.ts`.

Five swappable kinds: **STT**, **TTS**, **LLM**, **Search**, **Scrape**.

#### Adding a provider — exactly four edits

1. Write `lib/providers/<kind>/<vendor>.ts` implementing the interface.
2. Add one line to the map in `lib/providers/registry.ts`.
3. Set the env var (`TTS_PROVIDER=elevenlabs`, plus its key).
4. Add the key to the zod schema in `lib/env.ts`.

Nothing else changes — no component edits, no route edits. `lib/providers/llm/gemini.ts` exists
purely to prove this: it is a second LLM adapter written against Gemini's REST API, and adding it
touched only those four places.

---

## Layout

```
app/
  (marketing)/           landing, privacy policy
  (auth)/                login, register
  (app)/                 profile · setup · interview/[id] · results/[id] · account · dashboard
  interviewer/           sessions (anonymised) · roles · audit log
  api/                   stt/token · tts · profile/* · interview/* · privacy/* · interviewer/* · cron/purge
  dev/voice              throwaway audio harness
lib/
  providers/             the swap surface — the only place vendor SDKs may be imported
  audio/                 capture · pcm-worklet · playback
  profile/               extract-cv · extract-facts · research
  interview/             prompts · grounding · difficulty · scoring · orchestrator · useInterview
  security/              crypto (AES-256-GCM) · password (argon2id) · anonymise
  privacy/               retention
  db/                    client · models · repositories/*
  env.ts                 zod-validated, fails loudly at boot
components/
  avatar/                the hand-built SVG rig
  interview/             TranscriptPane · MicButton · TurnIndicator
  ui/                    hand-rolled button, field, surface, theme toggle
```

**Every prompt template lives in `lib/interview/prompts.ts` and nowhere else.** A prompt string in a
route handler or a component is a bug.

---

## How scoring works

Deliberately split in two, so half of every score can be recomputed by hand and defended without
appealing to a model's judgement.

**Deterministic** (`lib/interview/scoring.ts`, pure functions, unit-tested):
words, words-per-minute, a pace score that is 100 inside 120–160 WPM and falls off linearly outside
it, and a filler rate over `um, uh, like, you know, basically, actually, sort of, kind of`.

**LLM-judged** (one JSON call per turn): relevance, clarity, structure — where structure is STAR
adherence on behavioural questions — plus two sentences of feedback and which expected points were
covered or missed.

```
turnScore    = 0.40·relevance + 0.25·clarity + 0.20·structure + 0.15·paceScore
sessionScore = mean(turnScores)
```

Weights live in one exported const. A **typed** answer has no pace, so its 15% is redistributed
across the other three rather than scored zero — otherwise every answer on the accessibility path
would cap at 85.

### Adaptive difficulty

A deterministic policy over the last two turn scores: mean ≥ 80 promotes, ≤ 45 demotes, otherwise
hold; and when it holds with points missed, the next question follows up on the same competency.
Every change is logged on the session with the trigger that caused it.

This is **not** reinforcement learning. Nothing here learns from reward, and describing it as RL in
the write-up would be a misrepresentation. It is an adaptive control policy — explainable,
debuggable, and demonstrable.

---

## Privacy and security

- **Audio is never stored.** It streams to the transcription provider and is discarded. Only
  transcripts exist. This is the strongest claim the product has.
- **Field-level encryption** (AES-256-GCM) on CV text, extracted facts, transcripts and question
  text before anything reaches MongoDB. `smoke:privacy` proves it by grepping raw Atlas documents.
- **Grounding.** Every extracted fact must quote its source verbatim; the quote is checked as a
  literal substring and facts that fail are discarded, not repaired. Questions naming an employer
  with no supporting evidence are rejected.
- **Prompt injection.** All CV and scraped text is wrapped in fenced data blocks that the content
  cannot forge its way out of, with the model told explicitly that fenced text is never an
  instruction. Tested structurally in `lib/interview/injection.test.ts` and behaviourally in
  `smoke:brain`.
- **SSRF.** Candidate-supplied URLs are resolved and checked against private ranges before fetching,
  redirects are followed manually and re-validated each hop, with a timeout, a size cap and
  robots.txt honoured.
- **Anonymisation.** The interviewer console shows pseudonyms by default. Revealing an identity is
  an explicit action that writes an audit entry naming who did it.
- **Retention.** Transcripts purge automatically after 90 days via Vercel Cron; scores survive.

---

## Deploying

See [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Known constraints

| Thing | Detail |
|---|---|
| Speechmatics TTS is **preview** | No SLA, pricing unannounced. Have a second TTS adapter tested before any live demo — it is four edits. |
| TTS first byte measured **2–3s** | Well above the PRD's 1.5s target. Mitigated by prefetching question N+1's audio while the candidate answers question N, and by rendering question text before audio starts. Not fixable in our code. |
| Groq model availability moves | `llama-3.3-70b-versatile` was retired during the build. `GROQ_MODEL` is an env var for this reason. |
| Browser support | Chrome, Edge, Firefox, Safari 16.4+ — AudioWorklet is required. |
| v1 is **bi-modal** | Verbal (LLM) plus vocal (pace, fillers, latency). Facial and speech-emotion analysis are out of scope; the turn schema reserves `modalities.vocal` and `modalities.visual` so v2 needs no migration. |
