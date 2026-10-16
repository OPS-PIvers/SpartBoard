import type { QuizResponse, QuizResponseAnswer } from '@/types';

/** Only a response the student hasn't turned in yet can be submitted for them. */
export function canTeacherSubmit(
  response: Pick<QuizResponse, 'status'>
): boolean {
  return response.status === 'joined' || response.status === 'in-progress';
}

/** The questions this student was served; mirrors resolveUnrespondedQuestionIds in finalizeIdleQuizAttempts. */
function servedQuestionIds(
  sessionQuestionIds: readonly string[],
  served: unknown
): string[] {
  if (!Array.isArray(served)) return [...sessionQuestionIds];
  const set = new Set(
    served.filter((id): id is string => typeof id === 'string')
  );
  return sessionQuestionIds.filter((id) => set.has(id));
}

/**
 * The response update that turns in a student's saved work, used by Submit for
 * student and the teacher's End and mirrored by functions/src/quizFinalize.ts:
 * drafts become submitted, unreached questions are marked abandoned on sessions
 * that understand them, and a blank attempt uses no slot.
 * Returns null when the response is already turned in.
 */
export function buildTeacherSubmitUpdate(
  response: Pick<
    QuizResponse,
    'status' | 'answers' | 'completedAttempts' | 'servedQuestionIds'
  >,
  session: { questionIds: readonly string[]; completenessModel?: number },
  now: number
): Record<string, unknown> | null {
  if (!canTeacherSubmit(response)) return null;
  const answers = (
    Array.isArray(response.answers) ? response.answers : []
  ).filter((a): a is QuizResponseAnswer => a !== null && typeof a === 'object');
  const finalAnswers = answers.map((a) =>
    a.status === 'draft' ? { ...a, status: 'submitted' as const } : a
  );
  const missing: QuizResponseAnswer[] = [];
  if ((session.completenessModel ?? 0) >= 1) {
    const answered = new Set(finalAnswers.map((a) => a.questionId));
    for (const qid of servedQuestionIds(
      session.questionIds,
      response.servedQuestionIds
    )) {
      if (answered.has(qid)) continue;
      missing.push({
        questionId: qid,
        answer: '',
        answeredAt: now,
        status: 'submitted',
        unresponded: 'abandoned',
      });
    }
  }
  const update: Record<string, unknown> = {
    status: 'completed',
    submittedAt: now,
    answers: missing.length > 0 ? [...finalAnswers, ...missing] : finalAnswers,
    unlocked: false,
  };
  if (finalAnswers.length > 0) {
    update.completedAttempts = (response.completedAttempts ?? 0) + 1;
  }
  return update;
}
