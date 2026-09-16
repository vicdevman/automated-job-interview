import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { auth } from '@/auth';
import { env } from '@/lib/env';
import { findRoleById } from '@/lib/db/repositories/roles';
import { listConfirmedFacts } from '@/lib/db/repositories/facts';
import { listDocuments } from '@/lib/db/repositories/documents';
import { findQuestionSet, upsertQuestionSet } from '@/lib/db/repositories/questionSets';
import { createSession } from '@/lib/db/repositories/sessions';
import { generateQuestionSet } from '@/lib/interview/orchestrator';
import type { GroundingContext } from '@/lib/interview/grounding';
import type { Level } from '@/lib/db/models';
import { CONSENT_SCOPE, CONSENT_VERSION } from '@/lib/interview/consent';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const schema = z.object({
  roleId: z.string().min(1),
  level: z.enum(['junior', 'mid', 'senior']),
  voiceId: z.string().trim().min(1).max(64).default('theo'),
  consent: z.literal(true, { message: 'Consent is required before an interview can start.' }),
  /** Forces regeneration instead of reusing a cached set. */
  fresh: z.boolean().default(false),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  const userId = new ObjectId(session.user.id);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }
  const { roleId, level, voiceId, fresh } = parsed.data;

  const role = await findRoleById(roleId);
  if (!role) {
    return NextResponse.json({ error: 'That role no longer exists.' }, { status: 404 });
  }

  try {
    // Only CONFIRMED facts may ground a question (PRD §5.3).
    const facts = await listConfirmedFacts(userId);
    const personalised = facts.length > 0;

    const grounding: GroundingContext = {
      factsById: new Map(facts.map((f) => [f.id, f])),
      roleText: `${role.title}. ${role.description} Competencies: ${role.competencies.join(', ')}.`,
    };

    // Company context, if the candidate supplied a company page.
    const documents = await listDocuments(userId);
    const companyDoc = documents.find((d) => d.kind === 'company');

    let questions;
    let generatedBy = { provider: 'cache', model: 'cache' };
    let questionSetId: ObjectId | null = null;

    const cached = fresh
      ? null
      : await findQuestionSet(role._id, level as Level, personalised ? userId : null);

    if (cached && cached.questions.length > 0) {
      questions = cached.questions;
      generatedBy = cached.generatedBy;
      questionSetId = new ObjectId(cached.id);
    } else {
      const result = await generateQuestionSet(
        {
          roleTitle: role.title,
          roleDescription: role.description,
          competencies: role.competencies,
          level: level as Level,
          count: env.INTERVIEW_QUESTION_COUNT,
          facts,
          companyContext: companyDoc
            ? { name: companyDoc.url ?? 'the company', text: companyDoc.rawText }
            : undefined,
        },
        grounding,
      );

      if (result.questions.length === 0) {
        console.error('[interview/start] generation produced no valid questions', result.rejected);
        return NextResponse.json(
          { error: 'Could not prepare questions for this role. Try again in a moment.' },
          { status: 502 },
        );
      }

      const stored = await upsertQuestionSet({
        roleId: role._id,
        level: level as Level,
        userId: personalised ? userId : null,
        questions: result.questions,
        generatedBy: result.provider,
      });

      questions = stored.questions;
      generatedBy = stored.generatedBy;
      questionSetId = new ObjectId(stored.id);
    }

    const interview = await createSession({
      userId,
      roleId: role._id,
      roleTitle: role.title,
      level: level as Level,
      voiceId,
      questionSetId,
      plannedQuestionCount: questions.length,
      consent: {
        givenAt: new Date(),
        version: CONSENT_VERSION,
        scope: [...CONSENT_SCOPE],
      },
    });

    const first = questions[0];

    return NextResponse.json(
      {
        sessionId: interview._id.toHexString(),
        roleTitle: role.title,
        level,
        voiceId,
        questionCount: questions.length,
        personalised,
        generatedBy,
        firstQuestion: first,
        // Handed to the client so it can prefetch audio for question 2 while the
        // candidate answers question 1 — TTS first-byte is ~2-3s and that is the
        // only way to keep it off the critical path.
        questions,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('[interview/start] failed', e);
    return NextResponse.json({ error: 'Could not start the interview.' }, { status: 500 });
  }
}
