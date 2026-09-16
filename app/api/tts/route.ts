import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { tts } from '@/lib/providers/registry';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * PRD §10 — proxies synthesis so the API key stays server-side, and streams the
 * bytes straight through so playback can begin before synthesis completes.
 */
const schema = z.object({
  // Keeping questions short is what holds first-byte latency under 200ms (PRD §16).
  text: z.string().trim().min(1).max(2000),
  voiceId: z.string().trim().min(1).max(64).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }

  try {
    const result = await tts().synthesize({
      text: parsed.data.text,
      voiceId: parsed.data.voiceId ?? env.SPEECHMATICS_TTS_VOICE,
    });

    return new Response(result.stream, {
      headers: {
        'Content-Type': result.mimeType,
        'Cache-Control': 'no-store',
        'X-Sample-Rate': String(result.sampleRate),
      },
    });
  } catch (e) {
    console.error('[tts] synthesis failed', e);
    return NextResponse.json({ error: 'Could not synthesise speech.' }, { status: 502 });
  }
}
