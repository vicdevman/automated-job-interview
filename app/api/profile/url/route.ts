import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { auth } from '@/auth';
import { fetchCandidateUrl } from '@/lib/profile/research';
import { ScrapeRejected } from '@/lib/providers/scrape/readability';
import { extractFactsFromDocument } from '@/lib/profile/extract-facts';
import { insertDocument } from '@/lib/db/repositories/documents';
import { insertFacts } from '@/lib/db/repositories/facts';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const schema = z.object({
  url: z.string().trim().url('Enter a full URL including https://'),
  kind: z.enum(['url', 'company']).default('url'),
});

/** PRD §5.1 — scrape a candidate-supplied page and extract grounded facts from it. */
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
    const page = await fetchCandidateUrl(parsed.data.url);

    const document = await insertDocument({
      userId,
      kind: parsed.data.kind,
      url: page.url,
      rawText: page.text,
      mimeType: 'text/html',
      sizeBytes: page.text.length,
    });

    // Company pages describe the company, not the candidate, so they are stored
    // as context but never mined for personal facts.
    if (parsed.data.kind === 'company') {
      return NextResponse.json(
        { documentId: document.id, url: page.url, title: page.title, characters: page.text.length, facts: [] },
        { status: 201 },
      );
    }

    const outcome = await extractFactsFromDocument({
      sourceId: document.id,
      documentText: page.text,
      documentLabel: `CANDIDATE PAGE (${page.url})`,
    });

    const saved = await insertFacts(userId, outcome.facts);

    return NextResponse.json(
      {
        documentId: document.id,
        url: page.url,
        title: page.title,
        characters: page.text.length,
        facts: saved,
        stats: outcome.stats,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ScrapeRejected) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error('[profile/url] failed', e);
    return NextResponse.json({ error: 'Could not read that page.' }, { status: 502 });
  }
}
