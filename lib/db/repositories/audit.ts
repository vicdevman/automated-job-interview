import 'server-only';
import { ObjectId } from 'mongodb';
import { collection } from '../client';
import { COLLECTIONS, type AuditAction, type AuditLogDoc } from '../models';

const auditLog = () => collection<AuditLogDoc>(COLLECTIONS.auditLog);

/**
 * PRD §8.3 — identity reveals, exports and deletions are all recorded. Writing
 * an audit entry must never break the action it describes, so failures are
 * logged and swallowed.
 */
export async function recordAudit(entry: {
  actorId: ObjectId | null;
  action: AuditAction;
  subjectId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await (await auditLog()).insertOne({
      _id: new ObjectId(),
      actorId: entry.actorId,
      action: entry.action,
      subjectId: entry.subjectId ?? null,
      meta: entry.meta ?? {},
      createdAt: new Date(),
    });
  } catch (e) {
    console.error('[audit] failed to record', entry.action, e);
  }
}

export async function listAudit(limit = 100): Promise<AuditLogDoc[]> {
  return (await auditLog()).find({}).sort({ createdAt: -1 }).limit(limit).toArray();
}
