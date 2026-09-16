# Changes needed to the written project

**For:** the project supervisor
**Purpose:** the implemented system differs from the submitted design document in several places.
Each difference below is deliberate, and each has a reason. They are raised now because chapter
edits are cheap before sign-off and expensive after it.

The changes fall into three groups: **things that were technically impossible as written**, **things
that were renamed to be honest about what was built**, and **one genuinely large rewrite** (the data
model). The largest is flagged first.

---

## 1. Chapters 4.4 and 4.5 — relational tables become document collections

**This is the biggest change and should be addressed first.**

The document specifies relational tables with foreign keys. The system is built on **MongoDB**, a
document database. The tables must be rewritten as collections.

**Why:** the data is naturally document-shaped. An interview turn carries nested timing data, nested
metrics, nested scores, and a reserved slot for future modalities. In a relational schema that is
five joined tables reassembled on every read; as a document it is one read. The evaluation payload
returned by the language model is JSON, and storing JSON as JSON avoids a translation layer that
exists only to satisfy the schema.

**What to write instead:** eight collections, with these relationships:

| Collection | Holds | Links to |
|---|---|---|
| `users` | account, role, pseudonym | — |
| `documents` | CV text and scraped pages (encrypted) | `userId` |
| `candidateFacts` | extracted facts with verbatim evidence (encrypted) | `userId`, `evidence.sourceId` |
| `roles` | job roles and competencies | — |
| `questionSets` | generated question banks (encrypted) | `roleId`, `level`, optional `userId` |
| `sessions` | one interview: consent, scores, difficulty history | `userId`, `roleId` |
| `turns` | one question and answer (encrypted transcript) | `sessionId` |
| `auditLog` | identity reveals, exports, deletions | — |

Indexes: `users.email` (unique), `sessions.userId`, `turns.sessionId`,
`questionSets.{roleId, level, userId}`, `documents.userId`, `sessions.completedAt`.

The three-tier architecture in Chapter 4.2 is **unchanged** — presentation, logic and data are still
three distinct tiers. Only the data tier's technology differs.

---

## 2. Chapters 4.3 and 4.10 — the backend is not Python

The document specifies a Python backend. The system is built entirely in **TypeScript**, using
Next.js route handlers as the application tier, deployed as serverless functions.

**Why:** the interview loop is latency-sensitive. A separate Python service would add a network hop
on every turn, a second deployment target, and a second language boundary to keep in sync — for no
capability gain, since none of the work is numerical. A unified TypeScript runtime also means the
audio pipeline, which must run in the browser, shares its types with the server that scores it.

**What to write instead:** "the application tier is implemented as serverless route handlers in
TypeScript, reducing inter-service latency and deployment complexity."

---

## 3. Objective 1 — Whisper cannot do what the objective requires

The objective names **OpenAI Whisper** for speech recognition. Whisper has **no realtime streaming
API**. It transcribes complete audio files after the fact.

The objective also requires *real-time* interaction, so as written it is self-contradictory: the
named tool cannot deliver the named capability.

**What was built:** Speechmatics realtime, which streams partial transcripts in under 500ms while
the candidate is still speaking. Whisper remains available in the system as a *batch* provider
behind the same interface, so the architecture accommodates it — it simply cannot drive the live
conversation.

**What to write instead:** name the capability, not the vendor — "realtime speech recognition" —
and note that the provider is swappable by configuration.

---

## 4. Objective 3 — the system is bi-modal, not tri-modal

The objective names BERT, CNN-LSTM and OpenCV for multi-modal analysis across text, speech emotion
and facial expression.

**What was built:** two of the three modalities.

- **Verbal** — semantic evaluation of answer content by a large language model, scoring relevance,
  clarity and structure, with STAR adherence judged on behavioural questions.
- **Vocal** — deterministic speech metrics: words per minute against a 120–160 band, filler-word
  rate, and thinking latency.
- **Visual** — **not built.**

**Why:** facial expression recognition needs video capture, a trained model, and an evidence base
linking expressions to interview performance that the project does not have. Building it badly would
be worse than not building it: a system that tells a candidate they looked nervous, on no sound
basis, is actively harmful.

The data model **reserves** `modalities.vocal` and `modalities.visual` on every turn, so adding
visual analysis later requires no migration. The architecture accommodates the objective; version
one does not deliver it.

**What to write instead:** state plainly that v1 delivers verbal and vocal analysis, and list visual
analysis in future work. Claiming three modalities and demonstrating two is the kind of thing an
examiner will find.

---

## 5. Objective 4 — it is an adaptive control policy, not reinforcement learning

The objective names **Reinforcement Learning** for adaptive questioning.

**What was built:** a deterministic policy over a rolling window of the last two answer scores. Mean
at or above 80 raises difficulty, at or below 45 lowers it, otherwise it holds; and when it holds
with expected points missed, the next question follows up on the same competency instead of moving
on. Every transition is logged with the trigger that caused it.

**Why this is better here, not just easier:** reinforcement learning needs a reward signal and many
episodes to learn from. A candidate runs one interview. There is nothing to learn from within a
session, and no reward signal across sessions. An RL agent would be untrained and therefore
arbitrary.

The deterministic policy is also *demonstrable* — you can show an examiner the exact rule, the exact
scores, and the logged reason for every difficulty change. An RL policy could not be explained that
way.

**What to write instead:** "an adaptive control policy over a rolling performance window."
Describing it as reinforcement learning would be a misrepresentation of what the code does.

---

## 6. Objective 6 — progress tracking was cancelled

Cross-session progress analytics were dropped from scope. The dashboard lists past sessions and
their scores, but there is no trend analysis across them.

Either remove the objective or restate it as "session history", which is what exists.

---

## 7. Objective 7 — name the NDPA, not only GDPR

The objective cites GDPR. The **Nigeria Data Protection Act 2023** is the directly applicable
regime, and naming it is both more accurate and more credible in a Nigerian defence.

The controls implemented satisfy both: lawful basis through explicit versioned consent, data
minimisation (audio is never stored at all), right of access (one-click full export), right of
erasure (immediate hard deletion), and storage limitation (automatic 90-day purge).

**What to write instead:** "NDPA 2023, and GDPR principles."

---

## 8. Chapter 4.7 — the scoring formula changed on one side

**Kept verbatim:** the pace band. A score of 100 inside 120–160 words per minute, falling off
linearly outside it, exactly as written.

**Changed:** keyword coverage was replaced by language-model semantic relevance scoring. Keyword
matching rewards a candidate for saying the right *words*; it cannot tell a correct answer from one
that name-drops the vocabulary. Semantic evaluation judges whether the question was actually
answered.

**New weights, which need documenting:**

```
turnScore    = 0.40·relevance + 0.25·clarity + 0.20·structure + 0.15·paceScore
sessionScore = mean(turnScores)
```

One further detail worth a sentence: a **typed** answer has no pace, so its 15% is redistributed
across the other three dimensions rather than scored as zero. Without that, every answer submitted
through the accessibility path would be capped at 85 out of 100 — a bug that would have quietly
penalised exactly the users the fallback exists to serve.

---

## 9. One addition the document does not mention at all

The system implements **grounded question generation with provenance**, which is not described in
the submitted design and is arguably the most defensible thing in the build.

Every question asked about a candidate's background traces to a **verbatim span** in a document they
uploaded. The language model proposes facts; each proposed fact must quote its source exactly, and
the quote is verified as a literal substring of the source text before the fact is stored. Facts
that fail are discarded, not repaired. Questions naming an employer or technology with no supporting
evidence are rejected and regenerated.

**Why it matters:** without this, "resume-aware question generation" is a claim that fails the first
time the system asks a candidate about a job they never had. With it, the claim is checkable — for
any question, the system can show the exact line of the CV that produced it.

This is worth a subsection of its own, and it is the single most compelling thing to demonstrate
live.

---

## Summary table

| Section | Change | Size |
|---|---|---|
| 4.4 / 4.5 | Relational tables → MongoDB collections | **Large — do first** |
| 4.3 / 4.10 | Python backend → TypeScript route handlers | Medium |
| Obj. 3 | Tri-modal → bi-modal, visual analysis to future work | Medium |
| Obj. 4 | Reinforcement learning → adaptive control policy | Medium |
| Obj. 1 | Whisper → "realtime speech recognition" | Small |
| Obj. 6 | Progress tracking removed | Small |
| Obj. 7 | Add NDPA 2023 | Small |
| 4.7 | Keyword coverage → semantic relevance; document new weights | Small |
| — | **Add** grounded generation with provenance | New subsection |
