import type { QuizAssignment } from '@/types';

// The assignment whose responses Results shows for a quiz opened from the Library.
export function latestArchivedAssignment(
  assignments: readonly QuizAssignment[],
  quizId: string
): QuizAssignment | undefined {
  let latest: QuizAssignment | undefined;
  for (const a of assignments) {
    if (a.quizId !== quizId || a.status !== 'inactive') continue;
    if (!latest || a.createdAt > latest.createdAt) latest = a;
  }
  return latest;
}
