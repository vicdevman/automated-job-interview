import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { auth } from '@/auth';
import { extractFactsFromDocument } from '@/lib/profile/extract-facts';
import { insertDocument } from '@/lib/db/repositories/documents';
import { insertFacts } from '@/lib/db/repositories/facts';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * PRD §5.1 — the typed-summary fallback, for candidates with no CV file or a
 * scanned one. Same grounding discipline: facts still have to quote this text.
 */
const schema = z.object({
  text: z.string().trim().min(100, 'Write at least a couple of sentences about your background.').max(20_000),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  const userId = new ObjectId(session.user.id);

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
    const document = await insertDocument({
      userId,
      kind: 'cv',
      filename: 'Typed summary',
      rawText: parsed.data.text,
      mimeType: 'text/plain',
      sizeBytes: parsed.data.text.length,
    });

    const outcome = await extractFactsFromDocument({
      sourceId: document.id,
      documentText: parsed.data.text,
      documentLabel: 'CANDIDATE TYPED SUMMARY',
    });

    const saved = await insertFacts(userId, outcome.facts);

    return NextResponse.json(
      { documentId: document.id, facts: saved, stats: outcome.stats },
      { status: 201 },
    );
  } catch (e) {
    console.error('[profile/text] failed', e);
    return NextResponse.json({ error: 'Could not process that summary.' }, { status: 500 });
  }
}
