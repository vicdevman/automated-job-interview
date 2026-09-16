import 'server-only';
import { ObjectId } from 'mongodb';
import { collection } from '../client';
import { COLLECTIONS, type DocumentDoc, type DocumentKind } from '../models';
import { decryptFieldSafe, encryptField } from '@/lib/security/crypto';

const documents = () => collection<DocumentDoc>(COLLECTIONS.documents);

export interface SourceDocument {
  id: string;
  kind: DocumentKind;
  filename?: string;
  url?: string;
  /** Decrypted. PRD §8.6: always treated as untrusted data, never instructions. */
  rawText: string;
  sizeBytes: number;
  createdAt: Date;
}

function toSource(doc: DocumentDoc): SourceDocument {
  return {
    id: doc._id.toHexString(),
    kind: doc.kind,
    ...(doc.filename ? { filename: doc.filename } : {}),
    ...(doc.url ? { url: doc.url } : {}),
    rawText: decryptFieldSafe(doc.rawText),
    sizeBytes: doc.sizeBytes,
    createdAt: doc.createdAt,
  };
}

export async function insertDocument(input: {
  userId: ObjectId;
  kind: DocumentKind;
  filename?: string;
  url?: string;
  rawText: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<SourceDocument> {
  const now = new Date();
  const doc: DocumentDoc = {
    _id: new ObjectId(),
    userId: input.userId,
    kind: input.kind,
    ...(input.filename ? { filename: input.filename } : {}),
    ...(input.url ? { url: input.url } : {}),
    rawText: encryptField(input.rawText),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    fetchedAt: now,
    createdAt: now,
  };
  await (await documents()).insertOne(doc);
  return toSource(doc);
}

export async function listDocuments(userId: ObjectId): Promise<SourceDocument[]> {
  const docs = await (await documents()).find({ userId }).sort({ createdAt: -1 }).toArray();
  return docs.map(toSource);
}

export async function findDocument(userId: ObjectId, id: string): Promise<SourceDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await (await documents()).findOne({ _id: new ObjectId(id), userId });
  return doc ? toSource(doc) : null;
}

export async function deleteDocument(userId: ObjectId, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const res = await (await documents()).deleteOne({ _id: new ObjectId(id), userId });
  return res.deletedCount === 1;
}

export async function deleteDocumentsForUser(userId: ObjectId): Promise<void> {
  await (await documents()).deleteMany({ userId });
}
