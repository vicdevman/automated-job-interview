import 'server-only';
import { ObjectId } from 'mongodb';
import { collection } from '../client';
import { COLLECTIONS, type TurnDoc } from '../models';
import { decryptFieldSafe, encryptField } from '@/lib/security/crypto';

const turns = () => collection<TurnDoc>(COLLECTIONS.turns);

/** The application-facing turn: identical to TurnDoc but with a readable transcript. */
export type Turn = Omit<TurnDoc, '_id' | 'sessionId' | 'transcript' | 'questionText'> & {
  id: string;
  sessionId: string;
  transcript: string;
  questionText: string;
};

function toTurn(doc: TurnDoc): Turn {
  const { _id, sessionId, transcript, questionText, ...rest } = doc;
  return {
    ...rest,
    id: _id.toHexString(),
    sessionId: sessionId.toHexString(),
    transcript: decryptFieldSafe(transcript),
    questionText: decryptFieldSafe(questionText),
  };
}

/**
 * PRD §12 — a completed turn is persisted immediately so a dropped connection
 * never loses an answer.
 */
export async function insertTurn(
  input: Omit<TurnDoc, '_id' | 'transcript' | 'questionText' | 'createdAt'> & {
    transcript: string;
    questionText: string;
  },
): Promise<Turn> {
  const doc: TurnDoc = {
    ...input,
    _id: new ObjectId(),
    transcript: encryptField(input.transcript),
    questionText: encryptField(input.questionText),
    createdAt: new Date(),
  };
  await (await turns()).insertOne(doc);
  return toTurn(doc);
}

export async function listTurns(sessionId: ObjectId): Promise<Turn[]> {
  const docs = await (await turns()).find({ sessionId }).sort({ index: 1 }).toArray();
  return docs.map(toTurn);
}

export async function countTurns(sessionId: ObjectId): Promise<number> {
  return (await turns()).countDocuments({ sessionId });
}

export async function deleteTurnsForSessions(sessionIds: ObjectId[]): Promise<void> {
  if (sessionIds.length === 0) return;
  await (await turns()).deleteMany({ sessionId: { $in: sessionIds } });
}
