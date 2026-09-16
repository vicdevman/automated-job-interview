import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createUser, findUserByEmail } from '@/lib/db/repositories/users';
import { hashPassword } from '@/lib/security/password';

export const runtime = 'nodejs';

/**
 * Candidate self-registration. The interviewer account is seeded at deploy time
 * (PRD §1.2) — `role` is never taken from the request body, so this endpoint
 * cannot mint an admin.
 */
const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200, 'Password is too long'),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid details.' },
      { status: 400 },
    );
  }

  const { name, email, password } = parsed.data;

  try {
    if (await findUserByEmail(email)) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
    }

    const user = await createUser({
      name,
      email,
      passwordHash: await hashPassword(password),
      role: 'candidate',
    });

    return NextResponse.json({ id: user._id.toHexString(), email: user.email }, { status: 201 });
  } catch (e) {
    // The unique index is the real guard against a race between the check above
    // and the insert.
    if (e instanceof Error && e.message.includes('E11000')) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
    }
    console.error('[register] failed', e);
    return NextResponse.json({ error: 'Could not create the account. Try again.' }, { status: 500 });
  }
}
