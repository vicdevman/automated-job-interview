import { NextResponse } from 'next/server';
import { purgeExpiredData } from '@/lib/privacy/retention';
import { recordAudit } from '@/lib/db/repositories/audit';
import { safeEqual } from '@/lib/security/crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * PRD §8.4 — the scheduled retention purge.
 *
 * Wired to Vercel Cron via vercel.json. Vercel sends
 * `Authorization: Bearer $CRON_SECRET`, so the endpoint is not open to the
 * internet. Compared in constant time — a timing oracle on a purge endpoint
 * would be a silly way to lose data.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';

  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured, so the purge endpoint is disabled.' },
      { status: 503 },
    );
  }
  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 401 });
  }

  try {
    const report = await purgeExpiredData();
    if (report.turnsPurged > 0 || report.documentsDeleted > 0) {
      await recordAudit({ actorId: null, action: 'privacy.delete', subjectId: null, meta: { retention: report } });
    }
    return NextResponse.json(report);
  } catch (e) {
    console.error('[cron/purge] failed', e);
    return NextResponse.json({ error: 'Purge failed.' }, { status: 500 });
  }
}
