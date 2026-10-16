// Server mirror of utils/quizTeacherSubmit.ts; tests/utils/quizFinalizeParity.test.ts keeps them in step.

/** Functions-local mirror of the fields of `QuizResponseAnswer` a finalize touches. */
export interface QuizFinalizeAnswer {
  questionId?: string;
  answer?: string;
  answeredAt?: number;
  status?: string;
  unresponded?:
    | 'passed'
    | 'expired'
    | 'abandoned'
    | 'capture-unavailable'
    | 'paper-unclear'
    | 'device-gated';
}

export interface QuizFinalizeResponse {
  status?: unknown;
  completedAttempts?: number;
  answers?: unknown;
  servedQuestionIds?: unknown;
}

export interface QuizFinalizeSession {
  questionIds: readonly string[];
  completenessModel: number;
}

/** The questions this student was served; a non-array snapshot means all of them. */
export function resolveUnrespondedQuestionIds(
  sessionQuestionIds: readonly string[],
  servedQuestionIds: unknown
): string[] {
  if (!Array.isArray(servedQuestionIds)) return [...sessionQuestionIds];
  const served = new Set(
    servedQuestionIds.filter((id): id is string => typeof id === 'string')
  );
  return sessionQuestionIds.filter((id) => served.has(id));
}

/** Question ids from a session's (content-merged) `publicQuestions`. */
export function sessionQuestionIds(publicQuestions: unknown): string[] {
  if (!Array.isArray(publicQuestions)) return [];
  return publicQuestions
    .map((q: unknown) =>
      q && typeof q === 'object' && 'id' in q && typeof q.id === 'string'
        ? q.id
        : null
    )
    .filter((id): id is string => !!id);
}

/** Promotes drafts, marks unreached questions, clears `unlocked`; null when already turned in. */
export function buildQuizFinalizeUpdate(
  response: QuizFinalizeResponse,
  session: QuizFinalizeSession,
  now: number
): Record<string, unknown> | null {
  if (response.status !== 'joined' && response.status !== 'in-progress') {
    return null;
  }
  const answers = (
    Array.isArray(response.answers) ? response.answers : []
  ).filter((a): a is QuizFinalizeAnswer => a !== null && typeof a === 'object');
  const finalAnswers = answers.map((a) =>
    a.status === 'draft' ? { ...a, status: 'submitted' } : a
  );
  const missing: QuizFinalizeAnswer[] = [];
  if (session.completenessModel >= 1) {
    const answered = new Set(
      finalAnswers
        .map((a) => a.questionId)
        .filter((id): id is string => typeof id === 'string')
    );
    for (const qid of resolveUnrespondedQuestionIds(
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
