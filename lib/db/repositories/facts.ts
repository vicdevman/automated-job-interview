import 'server-only';
import { ObjectId } from 'mongodb';
import { collection } from '../client';
import {
  COLLECTIONS,
  type CandidateFact,
  type CandidateFactDoc,
  type Confidence,
  type FactKind,
} from '../models';
import { decryptFieldSafe, encryptField } from '@/lib/security/crypto';

const facts = () => collection<CandidateFactDoc>(COLLECTIONS.candidateFacts);

function toFact(doc: CandidateFactDoc): CandidateFact {
  return {
    id: doc._id.toHexString(),
    kind: doc.kind,
    summary: decryptFieldSafe(doc.summary),
    evidence: {
      sourceId: doc.evidence.sourceId.toHexString(),
      quote: decryptFieldSafe(doc.evidence.quote),
      offset: doc.evidence.offset,
    },
    confidence: doc.confidence,
    confirmedByUser: doc.confirmedByUser,
  };
}

export async function insertFacts(
  userId: ObjectId,
  items: Array<{
    kind: FactKind;
    summary: string;
    evidence: { sourceId: string; quote: string; offset: number };
    confidence: Confidence;
  }>,
): Promise<CandidateFact[]> {
  if (items.length === 0) return [];
  const docs: CandidateFactDoc[] = items.map((f) => ({
    _id: new ObjectId(),
    userId,
    kind: f.kind,
    summary: encryptField(f.summary),
    evidence: {
      sourceId: new ObjectId(f.evidence.sourceId),
      quote: encryptField(f.evidence.quote),
      offset: f.evidence.offset,
    },
    confidence: f.confidence,
    confirmedByUser: false,
    confirmedAt: null,
    createdAt: new Date(),
  }));
  await (await facts()).insertMany(docs);
  return docs.map(toFact);
}

export async function listFacts(userId: ObjectId): Promise<CandidateFact[]> {
  const docs = await (await facts()).find({ userId }).sort({ createdAt: 1 }).toArray();
  return docs.map(toFact);
}

/** Only confirmed facts may ground a question (PRD §5.3, §5.5). */
export async function listConfirmedFacts(userId: ObjectId): Promise<CandidateFact[]> {
  const docs = await (await facts()).find({ userId, confirmedByUser: true }).toArray();
  return docs.map(toFact);
}

export async function updateFact(
  userId: ObjectId,
  id: string,
  patch: { summary?: string; kind?: FactKind },
): Promise<CandidateFact | null> {
  if (!ObjectId.isValid(id)) return null;
  const set: Record<string, unknown> = {};
  if (patch.summary !== undefined) set.summary = encryptField(patch.summary);
  if (patch.kind !== undefined) set.kind = patch.kind;
  const doc = await (await facts()).findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set: set },
    { returnDocument: 'after' },
  );
  return doc ? toFact(doc) : null;
}

export async function confirmFacts(userId: ObjectId, ids: string[]): Promise<number> {
  const objectIds = ids.filter(ObjectId.isValid).map((i) => new ObjectId(i));
  if (objectIds.length === 0) return 0;
  const res = await (await facts()).updateMany(
    { _id: { $in: objectIds }, userId },
    { $set: { confirmedByUser: true, confirmedAt: new Date() } },
  );
  return res.modifiedCount;
}

export async function deleteFact(userId: ObjectId, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const res = await (await facts()).deleteOne({ _id: new ObjectId(id), userId });
  return res.deletedCount === 1;
}

export async function deleteFactsForUser(userId: ObjectId): Promise<void> {
  await (await facts()).deleteMany({ userId });
}
