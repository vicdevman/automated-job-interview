import 'server-only';
import { collection } from '@/lib/db/client';
import { COLLECTIONS, type SessionDoc, type TurnDoc, type DocumentDoc } from '@/lib/db/models';
import { env } from '@/lib/env';

/**
 * PRD §8.4 — storage limitation.
 *
 * "Default retention: 90 days for transcripts, then automatic purge via a
 * scheduled job."
 *
 * What is purged and what is kept is a deliberate distinction: the TRANSCRIPTS
 * and the CV text are the personal data, and they go. The session's aggregate
 * scores stay, because they are no longer personal once the content behind them
 * is gone, and destroying them would erase the candidate's own record of having
 * practised. The session is marked so the results page can say honestly that
 * the detail has expired, rather than pretending it was never there.
 */

export interface PurgeReport {
  cutoff: string;
  sessionsScanned: number;
  turnsPurged: number;
  documentsDeleted: number;
  sessionsMarked: number;
}

export async function purgeExpiredData(now = new Date()): Promise<PurgeReport> {
  const cutoff = new Date(now.getTime() - env.RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const sessions = await collection<SessionDoc>(COLLECTIONS.sessions);
  const turns = await collection<TurnDoc>(COLLECTIONS.turns);
  const documents = await collection<DocumentDoc>(COLLECTIONS.documents);

  // Sessions old enough to purge, and not already purged.
  const expired = await sessions
    .find(
      { startedAt: { $lt: cutoff }, retentionPurgedAt: { $exists: false } },
      { projection: { _id: 1 } },
    )
    .toArray();

  const ids = expired.map((s) => s._id);

  let turnsPurged = 0;
  let sessionsMarked = 0;

  if (ids.length > 0) {
    // Blank the transcript rather than deleting the turn, so the score history
    // survives without the words behind it.
    const result = await turns.updateMany(
      { sessionId: { $in: ids } },
      { $set: { transcript: '', questionText: '', retentionPurgedAt: now } },
    );
    turnsPurged = result.modifiedCount;

    const marked = await sessions.updateMany(
      { _id: { $in: ids } },
      { $set: { retentionPurgedAt: now } },
    );
    sessionsMarked = marked.modifiedCount;
  }

  // Uploaded CVs and scraped pages are deleted outright — there is no aggregate
  // worth keeping from them.
  const deleted = await documents.deleteMany({ createdAt: { $lt: cutoff } });

  return {
    cutoff: cutoff.toISOString(),
    sessionsScanned: expired.length,
    turnsPurged,
    documentsDeleted: deleted.deletedCount,
    sessionsMarked,
  };
}
