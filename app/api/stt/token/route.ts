import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sttIssuer } from '@/lib/providers/registry';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PRD §8.2 — the temporary STT token is the ONLY credential that ever reaches
 * the browser. It is scoped to realtime transcription and expires in 300s.
 * Auth-gated so it cannot be farmed anonymously.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  try {
    const issued = await sttIssuer().issueToken({ ttlSeconds: env.STT_TOKEN_TTL_SECONDS });
    return NextResponse.json(issued, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[stt/token] mint failed', e);
    return NextResponse.json(
      { error: 'Could not obtain a transcription token.' },
      { status: 502 },
    );
  }
}
