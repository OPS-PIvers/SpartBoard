import type { QuizAssignment } from '@/types';

/** Warning line for a quiz's one delete confirm; undefined when it has no archived assignments or live ones block the delete. */
export const quizDeleteDetail = (
  assignments: readonly QuizAssignment[],
  quizId: string
): string | undefined => {
  const related = assignments.filter((a) => a.quizId === quizId);
  if (related.length === 0 || related.some((a) => a.status !== 'inactive')) {
    return undefined;
  }
  const n = related.length;
  return `This quiz has ${n} archived assignment${n === 1 ? '' : 's'}. Deleting it prevents viewing their monitor and results.`;
};
