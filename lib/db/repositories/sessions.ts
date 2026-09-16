import 'server-only';
import { ObjectId } from 'mongodb';
import { collection } from '../client';
import {
  COLLECTIONS,
  type DifficultyChange,
  type Level,
  type SessionDoc,
  type SessionStatus,
  type SubScores,
} from '../models';

const sessions = () => collection<SessionDoc>(COLLECTIONS.sessions);

export async function createSession(input: {
  userId: ObjectId;
  roleId: ObjectId;
  roleTitle: string;
  level: Level;
  voiceId: string;
  questionSetId: ObjectId | null;
  plannedQuestionCount: number;
  consent: { givenAt: Date; version: string; scope: string[] };
}): Promise<SessionDoc> {
  const doc: SessionDoc = {
    _id: new ObjectId(),
    userId: input.userId,
    roleId: input.roleId,
    roleTitle: input.roleTitle,
    level: input.level,
    voiceId: input.voiceId,
    status: 'in_progress',
    consent: input.consent,
    questionSetId: input.questionSetId,
    plannedQuestionCount: input.plannedQuestionCount,
    startedAt: new Date(),
    completedAt: null,
    durationSec: null,
    startingDifficulty: input.level,
    currentDifficulty: input.level,
    difficultyChanges: [],
    overallScore: null,
    subScores: null,
    summary: null,
    strengths: [],
    improvements: [],
  };
  await (await sessions()).insertOne(doc);
  return doc;
}

export async function findSessionById(id: string): Promise<SessionDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  return (await sessions()).findOne({ _id: new ObjectId(id) });
}

export async function listSessionsForUser(userId: ObjectId, limit = 50): Promise<SessionDoc[]> {
  return (await sessions()).find({ userId }).sort({ startedAt: -1 }).limit(limit).toArray();
}

export async function listAllSessions(limit = 100): Promise<SessionDoc[]> {
  return (await sessions()).find({}).sort({ startedAt: -1 }).limit(limit).toArray();
}

/** PRD §7.3 — every difficulty change is logged with the trigger that caused it. */
export async function recordDifficultyChange(
  sessionId: ObjectId,
  change: DifficultyChange,
): Promise<void> {
  await (await sessions()).updateOne(
    { _id: sessionId },
    { $push: { difficultyChanges: change }, $set: { currentDifficulty: change.to } },
  );
}

export async function completeSession(
  sessionId: ObjectId,
  result: {
    overallScore: number;
    subScores: SubScores;
    summary: string;
    strengths: string[];
    improvements: string[];
    durationSec: number;
  },
): Promise<void> {
  await (await sessions()).updateOne(
    { _id: sessionId },
    { $set: { ...result, status: 'completed' satisfies SessionStatus, completedAt: new Date() } },
  );
}

export async function markSessionStatus(sessionId: ObjectId, status: SessionStatus): Promise<void> {
  await (await sessions()).updateOne({ _id: sessionId }, { $set: { status } });
}

export async function deleteSessionsForUser(userId: ObjectId): Promise<ObjectId[]> {
  const col = await sessions();
  const ids = (await col.find({ userId }, { projection: { _id: 1 } }).toArray()).map((s) => s._id);
  await col.deleteMany({ userId });
  return ids;
}
