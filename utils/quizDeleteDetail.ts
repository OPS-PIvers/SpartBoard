import type { QuizAssignment } from '@/types';

/** Warning line for the quiz delete confirm; undefined when none of the quizzes has archived assignments or live ones block the delete. */
export const quizDeleteDetail = (
  assignments: readonly QuizAssignment[],
  quizIds: string | readonly string[]
): string | undefined => {
  const ids = typeof quizIds === 'string' ? [quizIds] : quizIds;
  const archivedCounts = ids
    .map((id) => assignments.filter((a) => a.quizId === id))
    .filter(
      (related) =>
        related.length > 0 && related.every((a) => a.status === 'inactive')
    )
    .map((related) => related.length);
  if (archivedCounts.length === 0) return undefined;
  if (ids.length === 1) {
    const n = archivedCounts[0];
    return `This quiz has ${n} archived assignment${n === 1 ? '' : 's'}. Deleting it prevents viewing their monitor and results.`;
  }
  const q = archivedCounts.length;
  return `${q} ${q === 1 ? 'quiz has' : 'quizzes have'} archived assignments. Deleting prevents viewing their monitor and results.`;
};
