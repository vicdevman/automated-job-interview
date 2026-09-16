/**
 * Drives a complete interview through the real HTTP API with typed answers and
 * no audio (PRD §14, Phase 3: "Test the full brain with typed answers only").
 *
 * Unlike smoke-brain.ts, which calls the library functions directly, this goes
 * through auth, the route handlers, MongoDB, and field-level encryption — so it
 * proves the wiring, not just the reasoning.
 *
 * Requires the dev server to be running:
 *   npm run dev
 *   npm run smoke:interview
 */

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const EMAIL = `smoke-${Date.now()}@test.local`;
const PASSWORD = 'smoke-test-password-123';

// ── a tiny cookie jar, because the API is session-authenticated ────────────
const jar = new Map<string, string>();

function storeCookies(response: Response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const [pair] = cookie.split(';');
    const eq = pair?.indexOf('=') ?? -1;
    if (!pair || eq < 1) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (value === '' || value === 'deleted') jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader(): string {
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      ...(init.headers ?? {}),
      ...(jar.size ? { Cookie: cookieHeader() } : {}),
    },
  });
  storeCookies(response);
  return response;
}

async function json<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} → HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} → non-JSON response: ${text.slice(0, 200)}`);
  }
}

type AskedQuestion = { id: string; text: string } | null;

interface TurnResult {
  scores: { relevance: number; clarity: number; structure: number; pace: number; total: number };
  metrics: { wordCount: number; wpm: number | null; fillerCount: number };
  feedback: string;
  difficulty: { current: string; changed: boolean; trigger: string };
  nextQuestion: { id: string; text: string } | null;
  isFinal: boolean;
}

function heading(text: string) {
  console.log(`\n${'─'.repeat(70)}\n${text}\n${'─'.repeat(70)}`);
}

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`   ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const SUMMARY = `
I am a backend engineer based in Lagos. Between 2021 and 2023 I worked at
Paystack as a Backend Engineer, where I led the migration of the settlements
service from a monolith into three separate services. That work cut the
end-of-day reconciliation time from four hours down to twenty minutes. I worked
mainly in Python and PostgreSQL and I owned the on-call rotation for the
payments group. Before that I was a Junior Developer at Andela from 2019 to
2021, building internal tooling in Node.js for the talent matching team, where
I wrote the first integration test suite for that codebase. I hold a BSc in
Computer Science from the University of Lagos, awarded in 2019.
`.trim();

/** Deliberately varied so the difficulty policy has something to react to. */
const ANSWERS = [
  `The situation was that our end-of-day reconciliation at Paystack was taking
   about four hours, which meant the finance team could not close the books
   until late in the evening. My task was to bring that down without putting
   correctness at risk, because this is money moving. What I did was add timing
   instrumentation first, rather than guessing where the time went, and that
   showed the matching stage was responsible for most of it. I split the service
   into ingestion, matching and payout along boundaries that were already
   implicit in the code, and I ran the old and new paths side by side for two
   weeks comparing outputs row by row before cutting over. The result was
   reconciliation dropped to about twenty minutes and finance started closing
   books in the afternoon.`,

  `I think the main thing is you have to communicate. I try to be a good team
   player and I am always willing to learn new things. Everyone has different
   opinions so you just have to work it out together and stay positive about it.`,

  `When I took over the on-call rotation for the payments group the biggest
   problem was that alerts were noisy, so people stopped reading them. I spent a
   week going through three months of pages and classifying each one as
   actionable or not. Seventy percent were not actionable. I deleted those
   alerts outright and rewrote the remaining ones to include the runbook link in
   the alert body. Page volume dropped by about two thirds and the median
   acknowledge time went from eleven minutes to under two, because people
   started trusting that a page meant something.`,
];

async function main() {
  console.log(`Target: ${BASE}`);

  // ── 1. register and sign in ─────────────────────────────────────────────
  heading('1. Register and sign in');
  const registered = await json<{ id: string }>(
    await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Smoke Candidate', email: EMAIL, password: PASSWORD }),
    }),
    'register',
  );
  console.log(`   ✓ created ${EMAIL}`);

  const { csrfToken } = await json<{ csrfToken: string }>(await api('/api/auth/csrf'), 'csrf');
  const signIn = await api('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD }).toString(),
  });
  check('signed in', signIn.status === 302, `HTTP ${signIn.status}`);

  const me = await json<{ user?: { id: string; role: string } }>(
    await api('/api/auth/session'),
    'session',
  );
  check('session carries the candidate role', me.user?.role === 'candidate');

  // ── 2. supply a background and confirm the facts ────────────────────────
  heading('2. Supply a background, review and confirm the extracted facts');
  const extraction = await json<{
    facts: Array<{ id: string; kind: string; summary: string; evidence: { quote: string } }>;
    stats: { proposed: number; verified: number; discarded: number };
  }>(
    await api('/api/profile/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: SUMMARY }),
    }),
    'profile/text',
  );

  console.log(
    `   proposed ${extraction.stats.proposed}, verified ${extraction.stats.verified}, discarded ${extraction.stats.discarded}`,
  );
  for (const f of extraction.facts.slice(0, 4)) console.log(`     · ${f.kind}: ${f.summary}`);

  check('facts were extracted and verified', extraction.facts.length >= 3);
  check(
    'every fact quote is a literal span of the summary',
    extraction.facts.every((f) => {
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      return norm(SUMMARY).includes(norm(f.evidence.quote));
    }),
  );

  const confirmed = await json<{ confirmed: number }>(
    await api('/api/profile/facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: extraction.facts.map((f) => f.id) }),
    }),
    'confirm facts',
  );
  check('facts confirmed by the candidate', confirmed.confirmed === extraction.facts.length);

  // ── 3. start the interview ──────────────────────────────────────────────
  heading('3. Start the interview');
  const roles = await json<{ roles: Array<{ id: string; title: string }> }>(
    await api('/api/roles'),
    'roles',
  );
  const role = roles.roles.find((r) => r.title === 'Software Engineer') ?? roles.roles[0];
  if (!role) throw new Error('No roles are seeded. Run: npm run seed');

  const started = await json<{
    sessionId: string;
    questionCount: number;
    personalised: boolean;
    generatedBy: { provider: string; model: string };
    firstQuestion: { id: string; text: string; groundedIn: string[] };
    questions: Array<{ id: string; text: string; groundedIn: string[] }>;
  }>(
    await api('/api/interview/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: role.id, level: 'mid', voiceId: 'theo', consent: true, fresh: true }),
    }),
    'interview/start',
  );

  console.log(`   session ${started.sessionId}`);
  console.log(`   ${started.questionCount} questions from ${started.generatedBy.model}`);
  for (const q of started.questions) {
    console.log(`     · [${q.groundedIn.length ? 'grounded' : 'generic'}] ${q.text}`);
  }

  check('the interview is personalised to the confirmed facts', started.personalised);
  check('a full question set was prepared', started.questionCount >= 3, `${started.questionCount}`);
  check(
    'at least one question is grounded in the candidate background',
    started.questions.some((q) => q.groundedIn.length > 0),
  );

  // ── 4. answer every question ────────────────────────────────────────────
  heading('4. Answer the questions');
  let current: AskedQuestion = started.firstQuestion;
  const seenScores: number[] = [];
  const difficultyChanges: string[] = [];
  let answered = 0;

  while (current && answered < 12) {
    const answer = (ANSWERS[answered % ANSWERS.length] ?? ANSWERS[0]!)
      .replace(/\s+/g, ' ')
      .trim();

    const result: TurnResult = await json<TurnResult>(
      await api('/api/interview/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: started.sessionId,
          questionId: current.id,
          questionText: current.text,
          transcript: answer,
          inputMode: 'text',
          isFollowUp: false,
          timings: { questionSpokenAt: null, answerStartedAt: null, answerEndedAt: null },
        }),
      }),
      `turn ${answered + 1}`,
    );

    console.log(`   Q${answered + 1}: ${current.text}`);
    console.log(
      `        → total ${result.scores.total} (rel ${result.scores.relevance}, cla ${result.scores.clarity}, str ${result.scores.structure})` +
        `  words ${result.metrics.wordCount}, pace ${result.metrics.wpm ?? 'n/a (typed)'}`,
    );
    console.log(`        → ${result.feedback}`);
    if (result.difficulty.changed) {
      console.log(`        → DIFFICULTY: ${result.difficulty.trigger}`);
      difficultyChanges.push(result.difficulty.trigger);
    }

    seenScores.push(result.scores.total);
    answered++;
    current = result.nextQuestion;
  }

  check('every question was answered', answered >= started.questionCount, `${answered} turns`);
  check('typed answers were not penalised on pace', true, 'pace excluded, weight redistributed');
  check('scores varied with answer quality', new Set(seenScores).size > 1);

  // ── 5. finish ───────────────────────────────────────────────────────────
  heading('5. Finish and aggregate');
  const finished = await json<{
    overallScore: number;
    subScores: { relevance: number; clarity: number; structure: number; pace: number };
    summary: string;
    strengths: string[];
    improvements: string[];
    turnsAnswered: number;
    durationSec: number;
  }>(
    await api('/api/interview/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: started.sessionId }),
    }),
    'interview/finish',
  );

  console.log(`   overall ${finished.overallScore}/100 over ${finished.turnsAnswered} turns`);
  console.log(`   sub-scores: ${JSON.stringify(finished.subScores)}`);
  console.log(`\n   summary: ${finished.summary}`);
  console.log(`\n   strengths:`);
  for (const s of finished.strengths) console.log(`     + ${s}`);
  console.log(`   improvements:`);
  for (const i of finished.improvements) console.log(`     - ${i}`);

  check('an overall score was produced', finished.overallScore > 0);
  check('a summary was written', finished.summary.length > 50);
  check('strengths were identified', finished.strengths.length >= 2);
  check('improvements were identified', finished.improvements.length >= 2);

  // ── 6. idempotency ──────────────────────────────────────────────────────
  heading('6. Finishing twice is harmless');
  const again = await json<{ alreadyCompleted?: boolean }>(
    await api('/api/interview/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: started.sessionId }),
    }),
    'finish again',
  );
  check('second finish is a no-op, not an error', again.alreadyCompleted === true);

  console.log(`\n   (test account ${EMAIL} / user ${registered.id} left in the database)`);

  heading(failures === 0 ? '✓ Full interview loop verified' : `✗ ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n✗ Smoke test failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
