import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { extractDocument, UploadRejected } from '@/lib/profile/extract-cv';
import { extractFactsFromDocument } from '@/lib/profile/extract-facts';
import { insertDocument } from '@/lib/db/repositories/documents';
import { insertFacts } from '@/lib/db/repositories/facts';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * PRD §10 — upload, parse, extract facts, return them for the candidate's
 * review. Nothing here is confirmed yet; §5.3 requires the candidate to
 * approve facts before they can ground a question.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  const userId = new ObjectId(session.user.id);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a file upload.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file was attached.' }, { status: 400 });
  }
  if (file.size > env.MAX_UPLOAD_BYTES) {
    const mb = (env.MAX_UPLOAD_BYTES / 1_048_576).toFixed(0);
    return NextResponse.json({ error: `That file is larger than ${mb} MB.` }, { status: 413 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractDocument({ bytes, filename: file.name });

    const document = await insertDocument({
      userId,
      kind: 'cv',
      filename: file.name,
      rawText: extracted.text,
      mimeType: extracted.mimeType,
      sizeBytes: extracted.sizeBytes,
    });

    const outcome = await extractFactsFromDocument({
      sourceId: document.id,
      documentText: extracted.text,
      documentLabel: `CANDIDATE CV (${file.name})`,
    });

    const saved = await insertFacts(
      userId,
      outcome.facts.map((f) => ({
        kind: f.kind,
        summary: f.summary,
        evidence: f.evidence,
        confidence: f.confidence,
      })),
    );

    return NextResponse.json(
      {
        documentId: document.id,
        filename: file.name,
        characters: extracted.text.length,
        ...(extracted.pageCount !== undefined ? { pages: extracted.pageCount } : {}),
        facts: saved,
        // Reported honestly rather than hidden — a discarded fact usually means
        // the model paraphrased, and the candidate deserves to know the count.
        discarded: outcome.stats.discarded,
        stats: outcome.stats,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof UploadRejected) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error('[profile/cv] failed', e);
    return NextResponse.json(
      { error: 'Could not process that CV. Try again, or paste a summary instead.' },
      { status: 500 },
    );
  }
}
