/**
 * Evidence for PRD §15 acceptance criteria 7 and 8.
 *
 *   7. Transcripts and CV text are unreadable when inspected directly in Atlas.
 *   8. POST /api/privacy/delete leaves no trace of the candidate in ANY
 *      collection.
 *
 * Creates a throwaway candidate with a deliberately distinctive marker string,
 * runs a real interview turn, inspects the raw MongoDB documents, exports,
 * deletes, and then greps every collection for the marker.
 *
 *   npm run dev
 *   npm run smoke:privacy
 */
import { MongoClient } from 'mongodb';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const STAMP = Date.now();
const EMAIL = `privacy-${STAMP}@test.local`;
const PASSWORD = 'privacy-test-password-123';

/** Appears only in this candidate's data. If it survives deletion, we leaked. */
const MARKER = `ZQXJV${STAMP}MARKER`;

const SUMMARY = `
I am a backend engineer. Between 2021 and 2023 I worked at ${MARKER} Limited as a
Backend Engineer, where I led the migration of the settlements service from a
monolith into three separate services. That work cut the end-of-day
reconciliation time from four hours down to twenty minutes. I worked mainly in
Python and PostgreSQL. I hold a BSc in Computer Science awarded in 2019.
`.trim();

const ANSWER = `
The situation was that reconciliation at ${MARKER} was taking about four hours,
so finance could not close the books until late. My task was to cut that down
without risking correctness. I added timing instrumentation first rather than
guessing, found the matching stage was the bottleneck, and split the service
into ingestion, matching and payout. I ran old and new in parallel for two weeks
comparing outputs row by row before cutting over. Reconciliation dropped to
about twenty minutes.
`.replace(/\s+/g, ' ').trim();

const jar = new Map<string, string>();

function storeCookies(response: Response) {
  for (const cookie of response.headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(';');
    const eq = pair?.indexOf('=') ?? -1;
    if (!pair || eq < 1) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (value === '' || value === 'deleted') jar.delete(name);
    else jar.set(name, value);
  }
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      ...(init.headers ?? {}),
      ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
    },
  });
  storeCookies(response);
  return response;
}

async function json<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} → HTTP ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

function heading(text: string) {
  console.log(`\n${'─'.repeat(70)}\n${text}\n${'─'.repeat(70)}`);
}

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`   ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const COLLECTIONS = [
  'users',
  'documents',
  'candidateFacts',
  'sessions',
  'turns',
  'questionSets',
  'auditLog',
  'roles',
];

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB);

  // ── set up a candidate with real data ───────────────────────────────────
  heading('1. Create a candidate and generate real data');
  await json(
    await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Privacy Test', email: EMAIL, password: PASSWORD }),
    }),
    'register',
  );

  const { csrfToken } = await json<{ csrfToken: string }>(await api('/api/auth/csrf'), 'csrf');
  await api('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD }).toString(),
  });

  const extraction = await json<{ facts: Array<{ id: string }> }>(
    await api('/api/profile/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: SUMMARY }),
    }),
    'profile/text',
  );
  await api('/api/profile/facts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: extraction.facts.map((f) => f.id) }),
  });

  const roles = await json<{ roles: Array<{ id: string; title: string }> }>(
    await api('/api/roles'),
    'roles',
  );
  const role = roles.roles[0]!;

  const started = await json<{ sessionId: string; firstQuestion: { id: string; text: string } }>(
    await api('/api/interview/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: role.id, level: 'mid', voiceId: 'theo', consent: true, fresh: true }),
    }),
    'interview/start',
  );

  await json(
    await api('/api/interview/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: started.sessionId,
        questionId: started.firstQuestion.id,
        questionText: started.firstQuestion.text,
        transcript: ANSWER,
        inputMode: 'text',
        isFollowUp: false,
      }),
    }),
    'turn',
  );

  console.log(`   ✓ candidate ${EMAIL} with ${extraction.facts.length} facts and 1 answered turn`);
  console.log(`   ✓ marker string: ${MARKER}`);

  // ── criterion 7: unreadable at rest ─────────────────────────────────────
  heading('2. Criterion 7 — is any of it readable in MongoDB?');
  let leakedBefore = 0;
  for (const name of COLLECTIONS) {
    const docs = await db.collection(name).find({}).toArray();
    const hits = docs.filter((d) => JSON.stringify(d).includes(MARKER)).length;
    if (hits > 0) leakedBefore += hits;
    console.log(`   ${name.padEnd(16)} ${hits > 0 ? `PLAINTEXT in ${hits} doc(s)` : 'no plaintext'}`);
  }
  check(
    'the marker appears nowhere in plaintext despite being in the CV and the answer',
    leakedBefore === 0,
    leakedBefore > 0 ? `${leakedBefore} document(s) leaked it` : 'all encrypted',
  );

  // ...but it must still be readable through the application.
  const exported = await json<{ documents: Array<{ text: string }>; interviews: unknown[] }>(
    await api('/api/privacy/export'),
    'export',
  );
  check(
    'criterion: the candidate can still read their own data (export decrypts)',
    JSON.stringify(exported).includes(MARKER),
  );
  check('the export includes their interviews', exported.interviews.length >= 1);

  // ── criterion 8: hard delete ────────────────────────────────────────────
  heading('3. Criterion 8 — delete leaves no trace');

  const refused = await api('/api/privacy/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'yes' }),
  });
  check('a delete without the exact confirmation is refused', refused.status === 400);

  const deleted = await json<{ deleted: boolean; sessions: number }>(
    await api('/api/privacy/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    }),
    'delete',
  );
  check('the deletion reports success', deleted.deleted === true);

  // Now search EVERY collection for anything belonging to this candidate.
  const user = await db.collection('users').findOne({ email: EMAIL });
  check('the user record is gone', user === null);

  let residue = 0;
  for (const name of COLLECTIONS) {
    const docs = await db.collection(name).find({}).toArray();
    const hits = docs.filter((d) => {
      const blob = JSON.stringify(d);
      return blob.includes(MARKER) || blob.includes(EMAIL);
    }).length;
    residue += hits;
    console.log(`   ${name.padEnd(16)} ${hits > 0 ? `${hits} RESIDUAL doc(s)` : 'clean'}`);
  }
  check('no collection retains anything identifying the candidate', residue === 0, `${residue} found`);

  // The audit entry must survive as a record that a deletion occurred, without
  // naming who.
  const audits = await db
    .collection('auditLog')
    .find({ action: 'privacy.delete' })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  check('a deletion was audited', audits.length === 1);
  check(
    'the audit entry does not itself identify the deleted candidate',
    audits.length === 1 && !JSON.stringify(audits[0]).includes(EMAIL),
  );

  await client.close();

  heading(failures === 0 ? '✓ Privacy controls verified' : `✗ ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n✗ Smoke test failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
