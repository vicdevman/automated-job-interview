import 'server-only';
import { MongoClient, type Db, type Collection, type Document } from 'mongodb';
import { env } from '@/lib/env';

/**
 * Cached MongoDB client.
 *
 * Serverless invocations reuse the same Node process when warm, so the client
 * is stashed on globalThis. Without this, every request opens a new connection
 * pool and Atlas starts refusing connections under load.
 */

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClient(): Promise<MongoClient> {
  const client = new MongoClient(env.MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 0,
    // 8s was too tight in practice: a transient DNS failure on one Atlas shard
    // host would time out server selection before the driver could fall back to
    // another node. Observed on a Nigerian connection to a EU-West-3 cluster,
    // which is exactly the demo condition. Round-trip time is ~270ms when
    // healthy, so 20s costs nothing normally and rides out the hiccup.
    serverSelectionTimeoutMS: 20_000,
    connectTimeoutMS: 20_000,
    socketTimeoutMS: 45_000,
    retryWrites: true,
    retryReads: true,
  });
  return client.connect();
}

export function mongoClient(): Promise<MongoClient> {
  if (!globalThis.__mongoClientPromise) {
    // A rejected promise must not be cached, or one bad connect poisons every
    // later request in this warm instance until it is recycled.
    globalThis.__mongoClientPromise = createClient().catch((e) => {
      globalThis.__mongoClientPromise = undefined;
      throw e;
    });
  }
  return globalThis.__mongoClientPromise;
}

export async function db(): Promise<Db> {
  const client = await mongoClient();
  return client.db(env.MONGODB_DB);
}

export async function collection<T extends Document>(name: string): Promise<Collection<T>> {
  return (await db()).collection<T>(name);
}

/** Cheap liveness probe for the health route and the setup screen. */
export async function pingDatabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    await (await db()).command({ ping: 1 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
