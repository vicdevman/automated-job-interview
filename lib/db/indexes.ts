import 'server-only';
import { db } from './client';
import { COLLECTIONS } from './models';

/**
 * PRD §9 index list. Idempotent — safe to call from the seed script and from a
 * health check. Mongo ignores a createIndex for an index that already exists.
 */
export async function ensureIndexes(): Promise<string[]> {
  const database = await db();
  const created: string[] = [];

  const plan: Array<[string, Parameters<ReturnType<typeof database.collection>['createIndex']>]> = [
    [COLLECTIONS.users, [{ email: 1 }, { unique: true, name: 'email_unique' }]],
    [COLLECTIONS.documents, [{ userId: 1 }, { name: 'documents_userId' }]],
    [COLLECTIONS.candidateFacts, [{ userId: 1 }, { name: 'facts_userId' }]],
    [COLLECTIONS.sessions, [{ userId: 1, startedAt: -1 }, { name: 'sessions_userId' }]],
    [COLLECTIONS.sessions, [{ completedAt: 1 }, { name: 'sessions_completedAt' }]],
    [COLLECTIONS.turns, [{ sessionId: 1, index: 1 }, { name: 'turns_sessionId_index' }]],
    [
      COLLECTIONS.questionSets,
      [{ roleId: 1, level: 1, userId: 1 }, { name: 'questionSets_role_level_user' }],
    ],
    [COLLECTIONS.auditLog, [{ createdAt: -1 }, { name: 'audit_createdAt' }]],
  ];

  for (const [name, args] of plan) {
    const result = await database.collection(name).createIndex(...args);
    created.push(`${name}.${result}`);
  }
  return created;
}
