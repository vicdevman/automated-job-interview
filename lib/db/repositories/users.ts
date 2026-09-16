import 'server-only';
import { ObjectId } from 'mongodb';
import { collection } from '../client';
import { COLLECTIONS, type UserDoc, type UserRole } from '../models';
import { pseudonymFor } from '@/lib/security/anonymise';

const users = () => collection<UserDoc>(COLLECTIONS.users);

/** Emails are stored lowercased so uniqueness is case-insensitive. */
export const normaliseEmail = (email: string) => email.trim().toLowerCase();

export async function findUserByEmail(email: string): Promise<UserDoc | null> {
  return (await users()).findOne({ email: normaliseEmail(email) });
}

export async function findUserById(id: string): Promise<UserDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  return (await users()).findOne({ _id: new ObjectId(id) });
}

export async function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
}): Promise<UserDoc> {
  const _id = new ObjectId();
  const doc: UserDoc = {
    _id,
    email: normaliseEmail(input.email),
    name: input.name.trim(),
    passwordHash: input.passwordHash,
    role: input.role,
    pseudonym: pseudonymFor(_id.toHexString()),
    createdAt: new Date(),
  };
  await (await users()).insertOne(doc);
  return doc;
}

export async function deleteUser(userId: ObjectId): Promise<void> {
  await (await users()).deleteOne({ _id: userId });
}
