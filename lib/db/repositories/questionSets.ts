import 'server-only';
import { ObjectId } from 'mongodb';
import { collection } from '../client';
import {
  COLLECTIONS,
  type GeneratedQuestion,
  type Level,
  type QuestionSet,
  type QuestionSetDoc,
} from '../models';
import { decryptField, encryptField } from '@/lib/security/crypto';

const questionSets = () => collection<QuestionSetDoc>(COLLECTIONS.questionSets);

/**
 * Question sets are stored with the question array encrypted as a JSON blob
 * (PRD §8.1). A personalised question quotes the candidate's CV, so it carries
 * the same sensitivity as the transcript.
 */
function toQuestionSet(doc: QuestionSetDoc): QuestionSet {
  let questions: GeneratedQuestion[] = [];
  try {
    const parsed: unknown = JSON.parse(decryptField(doc.questions));
    if (Array.isArray(parsed)) questions = parsed as GeneratedQuestion[];
  } catch {
    // A set that cannot be decrypted (rotated key, corrupted row) must not take
    // down the setup screen — it reads as "no cached set" and is regenerated.
    questions = [];
  }

  return {
    id: doc._id.toHexString(),
    roleId: doc.roleId.toHexString(),
    level: doc.level,
    userId: doc.userId ? doc.userId.toHexString() : null,
    questions,
    generatedBy: doc.generatedBy,
    generatedAt: doc.generatedAt,
  };
}

/**
 * Personalised sets are keyed by userId; generic sets have userId null and are
 * shared. Lookup prefers the personalised set when one exists.
 */
export async function findQuestionSet(
  roleId: ObjectId,
  level: Level,
  userId: ObjectId | null,
): Promise<QuestionSet | null> {
  const col = await questionSets();
  if (userId) {
    const personalised = await col.findOne({ roleId, level, userId });
    if (personalised) return toQuestionSet(personalised);
  }
  const generic = await col.findOne({ roleId, level, userId: null });
  return generic ? toQuestionSet(generic) : null;
}

export async function findQuestionSetById(id: string): Promise<QuestionSet | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await (await questionSets()).findOne({ _id: new ObjectId(id) });
  return doc ? toQuestionSet(doc) : null;
}

export async function upsertQuestionSet(input: {
  roleId: ObjectId;
  level: Level;
  userId: ObjectId | null;
  questions: GeneratedQuestion[];
  generatedBy: { provider: string; model: string };
}): Promise<QuestionSet> {
  const col = await questionSets();
  const doc: QuestionSetDoc = {
    _id: new ObjectId(),
    roleId: input.roleId,
    level: input.level,
    userId: input.userId,
    questions: encryptField(JSON.stringify(input.questions)),
    questionCount: input.questions.length,
    generatedBy: input.generatedBy,
    generatedAt: new Date(),
  };

  await col.replaceOne(
    { roleId: input.roleId, level: input.level, userId: input.userId },
    doc,
    { upsert: true },
  );

  const stored = await col.findOne({
    roleId: input.roleId,
    level: input.level,
    userId: input.userId,
  });
  return stored ? toQuestionSet(stored) : toQuestionSet(doc);
}

export async function listQuestionSets(limit = 100): Promise<QuestionSet[]> {
  const docs = await (await questionSets()).find({}).sort({ generatedAt: -1 }).limit(limit).toArray();
  return docs.map(toQuestionSet);
}

export async function deleteQuestionSetsForUser(userId: ObjectId): Promise<void> {
  await (await questionSets()).deleteMany({ userId });
}
