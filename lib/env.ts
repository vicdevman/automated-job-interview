import 'server-only';
import { z } from 'zod';

/**
 * PRD §13. Every environment variable this app reads is declared here and
 * validated at module load. A missing key fails at boot with a readable
 * message — not at 2am mid-demo.
 *
 * Adding a provider means adding its keys here (step 4 of the four-step
 * provider contract in PRD §3.2).
 */

const base64Key32 = z
  .string()
  .refine((v) => {
    try {
      return Buffer.from(v, 'base64').length === 32;
    } catch {
      return false;
    }
  }, 'must be exactly 32 bytes encoded as base64 (generate: openssl rand -base64 32)');

const intFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number(v)))
    .pipe(z.number().int().positive());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // ── core ─────────────────────────────────────────────────────────────
  MONGODB_URI: z.string().min(1, 'MongoDB connection string is required'),
  MONGODB_DB: z.string().default('interview_sim'),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 chars'),
  NEXTAUTH_URL: z.string().url().optional(),
  /**
   * Auth.js refuses to run behind a host it cannot verify. Vercel sets this
   * implicitly from its own environment; `next start` locally, Docker, and any
   * other host do not, and fail with UntrustedHost at sign-in.
   */
  AUTH_TRUST_HOST: z.string().optional(),
  ENCRYPTION_KEY: base64Key32,

  // ── provider selection: the swap surface (PRD §3.2) ───────────────────
  STT_PROVIDER: z.string().default('speechmatics'),
  NEXT_PUBLIC_STT_PROVIDER: z.string().default('speechmatics'),
  STT_BATCH_PROVIDER: z.string().default('whisper'),
  TTS_PROVIDER: z.string().default('speechmatics'),
  LLM_PROVIDER: z.string().default('groq'),
  SEARCH_PROVIDER: z.string().default('tavily'),
  SCRAPE_PROVIDER: z.string().default('readability'),

  // ── speechmatics ─────────────────────────────────────────────────────
  SPEECHMATICS_API_KEY: z.string().optional(),
  SPEECHMATICS_RT_URL: z.string().default('wss://global.rt.speechmatics.com/v2'),
  SPEECHMATICS_MP_URL: z.string().default('https://mp.speechmatics.com/v1'),
  SPEECHMATICS_TTS_URL: z.string().default('https://preview.tts.speechmatics.com'),
  SPEECHMATICS_TTS_VOICE: z.string().default('theo'),

  // ── llm ──────────────────────────────────────────────────────────────
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),

  // ── search ───────────────────────────────────────────────────────────
  TAVILY_API_KEY: z.string().optional(),

  // ── tuning ───────────────────────────────────────────────────────────
  STT_TOKEN_TTL_SECONDS: intFromEnv(300),
  INTERVIEW_QUESTION_COUNT: intFromEnv(6),
  MAX_UPLOAD_BYTES: intFromEnv(10_485_760),
  SCRAPE_TIMEOUT_MS: intFromEnv(10_000),
  SCRAPE_MAX_BYTES: intFromEnv(2_000_000),
  RETENTION_DAYS: intFromEnv(90),

  /** Set by Vercel Cron. Without it the retention purge endpoint is disabled. */
  CRON_SECRET: z.string().optional(),

  // ── seeding (PRD §1.2: seeded single Interviewer, no public admin signup)
  SEED_INTERVIEWER_EMAIL: z.string().email().optional(),
  SEED_INTERVIEWER_PASSWORD: z.string().optional(),

  /**
   * A ready-to-sign-in candidate account, seeded purely so the login page can
   * show working demo credentials. Optional — omit both to seed no demo
   * candidate and show nothing on the login page.
   */
  SEED_DEMO_CANDIDATE_EMAIL: z.string().email().optional(),
  SEED_DEMO_CANDIDATE_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new Error(
    `Invalid environment configuration.\n${lines.join('\n')}\n\n` +
      `Copy .env.example to .env.local and fill in the missing values.`,
  );
}

// Escape hatch so `next build` can run in CI without production secrets.
const skip = process.env.SKIP_ENV_VALIDATION === '1';

export const env: Env = skip ? (process.env as unknown as Env) : load();

/** Throws a readable error when an optional provider key is used but unset. */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable ${String(key)}. ` +
        `It is needed by the provider you selected. Add it to .env.local.`,
    );
  }
  return value as NonNullable<Env[K]>;
}
