import 'server-only';
import { ObjectId } from 'mongodb';
import { collection } from '../client';
import { COLLECTIONS, type Level, type RoleDoc } from '../models';

const roles = () => collection<RoleDoc>(COLLECTIONS.roles);

export async function listRoles(): Promise<RoleDoc[]> {
  return (await roles()).find({}).sort({ title: 1 }).toArray();
}

export async function findRoleById(id: string): Promise<RoleDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  return (await roles()).findOne({ _id: new ObjectId(id) });
}

export async function createRole(input: {
  title: string;
  description: string;
  competencies: string[];
  levels: Level[];
  createdBy: ObjectId | null;
}): Promise<RoleDoc> {
  const now = new Date();
  const doc: RoleDoc = { _id: new ObjectId(), ...input, createdAt: now, updatedAt: now };
  await (await roles()).insertOne(doc);
  return doc;
}

export async function updateRole(
  id: string,
  patch: Partial<Pick<RoleDoc, 'title' | 'description' | 'competencies' | 'levels'>>,
): Promise<RoleDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  const result = await (await roles()).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  return result ?? null;
}

export async function deleteRole(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const res = await (await roles()).deleteOne({ _id: new ObjectId(id) });
  return res.deletedCount === 1;
}
