import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { findSessionById } from '@/lib/db/repositories/sessions';
import { findQuestionSetById } from '@/lib/db/repositories/questionSets';
import { listTurns } from '@/lib/db/repositories/turns';
import { InterviewScreen } from './InterviewScreen';

export const metadata: Metadata = { title: 'Interview' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const interview = await findSessionById(sessionId);
  if (!interview || interview.userId.toHexString() !== session.user.id) notFound();

  // Already done — there is nothing to answer, so send them to the results.
  if (interview.status === 'completed') redirect(`/results/${sessionId}`);

  const questionSet = interview.questionSetId
    ? await findQuestionSetById(interview.questionSetId.toHexString())
    : null;
  const questions = questionSet?.questions ?? [];

  if (questions.length === 0) notFound();

  // Resume support: if turns already exist, pick up where they left off rather
  // than restarting the interview (PRD §12 — a drop must not lose progress).
  const answered = await listTurns(new ObjectId(sessionId));
  const mainAnswered = answered.filter((t) => !t.isFollowUp).length;
  const resumeAt = Math.min(mainAnswered, questions.length - 1);
  const firstQuestion = questions[resumeAt];

  if (!firstQuestion) notFound();

  return (
    <InterviewScreen
      sessionId={sessionId}
      roleTitle={interview.roleTitle}
      level={interview.level}
      voiceId={interview.voiceId}
      questions={questions}
      firstQuestion={firstQuestion}
      questionCount={interview.plannedQuestionCount}
      answeredSoFar={answered.length}
    />
  );
}
