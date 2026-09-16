// Deterministic test environment. Real secrets never appear here.
(process.env as Record<string, string | undefined>).NODE_ENV ??= 'test';
process.env.MONGODB_URI ??= 'mongodb://localhost:27017';
process.env.MONGODB_DB ??= 'interview_sim_test';
process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-16-chars';
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
