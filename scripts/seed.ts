/**
 * Bootstraps a fresh database: indexes, the single seeded Interviewer account
 * (PRD §1.2 — there is no public interviewer signup), and a starter set of
 * roles so a candidate can run an interview immediately.
 *
 * Idempotent. Run it as often as you like:  npm run seed
 *
 * `server-only` resolves to its no-op entry under the react-server condition,
 * which is why package.json runs this with --conditions=react-server.
 */
// Environment comes from --env-file=.env.local (see the seed script in package.json).
import { ObjectId } from 'mongodb';
import { ensureIndexes } from '@/lib/db/indexes';
import { collection, mongoClient } from '@/lib/db/client';
import { COLLECTIONS, type RoleDoc, type Level } from '@/lib/db/models';
import { createUser, findUserByEmail } from '@/lib/db/repositories/users';
import { hashPassword } from '@/lib/security/password';
import { env } from '@/lib/env';

const STARTER_ROLES: Array<Omit<RoleDoc, '_id' | 'createdBy' | 'createdAt' | 'updatedAt'>> = [
  {
    title: 'Software Engineer',
    description:
      'Designs, builds and maintains production software. Expected to reason about trade-offs, debug unfamiliar systems, and work effectively inside a team of engineers.',
    competencies: [
      'Problem solving',
      'System design',
      'Debugging under pressure',
      'Code quality',
      'Collaboration',
      'Communication',
    ],
    levels: ['junior', 'mid', 'senior'],
  },
  {
    title: 'Data Analyst',
    description:
      'Turns raw data into decisions. Expected to query and clean data, choose appropriate analyses, and explain findings to people who are not analysts.',
    competencies: [
      'SQL and data wrangling',
      'Statistical reasoning',
      'Data visualisation',
      'Business judgement',
      'Stakeholder communication',
    ],
    levels: ['junior', 'mid', 'senior'],
  },
  {
    title: 'Product Manager',
    description:
      'Owns the direction of a product. Expected to prioritise ruthlessly, work from evidence rather than opinion, and align engineering, design and business stakeholders.',
    competencies: [
      'Prioritisation',
      'User research',
      'Roadmapping',
      'Stakeholder management',
      'Metrics and experimentation',
    ],
    levels: ['junior', 'mid', 'senior'],
  },
  {
    title: 'Customer Support Specialist',
    description:
      'First line of contact for customers. Expected to de-escalate, diagnose problems accurately, and write clearly under time pressure.',
    competencies: [
      'Empathy and de-escalation',
      'Written communication',
      'Problem diagnosis',
      'Product knowledge',
      'Time management',
    ],
    levels: ['junior', 'mid'] as Level[],
  },
];

async function main() {
  console.log('→ connecting to', env.MONGODB_DB);
  await mongoClient();

  console.log('→ ensuring indexes');
  const indexes = await ensureIndexes();
  for (const i of indexes) console.log('   ✓', i);

  console.log('→ seeding roles');
  const roles = await collection<RoleDoc>(COLLECTIONS.roles);
  for (const role of STARTER_ROLES) {
    const existing = await roles.findOne({ title: role.title });
    if (existing) {
      console.log('   · exists:', role.title);
      continue;
    }
    const now = new Date();
    await roles.insertOne({ _id: new ObjectId(), ...role, createdBy: null, createdAt: now, updatedAt: now });
    console.log('   ✓ created:', role.title);
  }

  console.log('→ seeding the interviewer account');
  const email = env.SEED_INTERVIEWER_EMAIL;
  const password = env.SEED_INTERVIEWER_PASSWORD;
  if (!email || !password) {
    console.log('   · skipped — set SEED_INTERVIEWER_EMAIL and SEED_INTERVIEWER_PASSWORD');
  } else if (await findUserByEmail(email)) {
    console.log('   · exists:', email);
  } else {
    await createUser({
      email,
      name: 'Interviewer',
      passwordHash: await hashPassword(password),
      role: 'interviewer',
    });
    console.log('   ✓ created:', email);
  }

  console.log('→ seeding the demo candidate account');
  const demoEmail = env.SEED_DEMO_CANDIDATE_EMAIL;
  const demoPassword = env.SEED_DEMO_CANDIDATE_PASSWORD;
  if (!demoEmail || !demoPassword) {
    console.log('   · skipped — set SEED_DEMO_CANDIDATE_EMAIL and SEED_DEMO_CANDIDATE_PASSWORD');
  } else if (await findUserByEmail(demoEmail)) {
    console.log('   · exists:', demoEmail);
  } else {
    await createUser({
      email: demoEmail,
      name: 'Demo Candidate',
      passwordHash: await hashPassword(demoPassword),
      role: 'candidate',
    });
    console.log('   ✓ created:', demoEmail);
  }

  console.log('\nSeed complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('\nSeed failed:', e);
  process.exit(1);
});
