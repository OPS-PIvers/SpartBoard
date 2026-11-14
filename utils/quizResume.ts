import type { QuizResponseAnswer } from '@/types';

/** Where a self-paced student restarts: the saved question, else the first with no submitted answer, else the last. */
export function resumeQuestionIndex(
  questionIds: readonly string[],
  storedId: string | null,
  answers: readonly Pick<QuizResponseAnswer, 'questionId' | 'status'>[]
): number {
  if (questionIds.length === 0) return 0;
  const stored = storedId ? questionIds.indexOf(storedId) : -1;
  if (stored >= 0) return stored;
  const done = new Set(
    answers.filter((a) => a.status !== 'draft').map((a) => a.questionId)
  );
  const firstOpen = questionIds.findIndex((id) => !done.has(id));
  return firstOpen >= 0 ? firstOpen : questionIds.length - 1;
}
