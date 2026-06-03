import type { QuizQuestion } from '@/types';

/**
 * The gradebook denominator for a quiz: the sum of per-question points (each
 * question defaults to 1 point), or 100 when the quiz has no scorable points to
 * sum.
 *
 * This single value is frozen into an LMS line item's `scoreMaximum` when a quiz
 * is ATTACHED and is also the denominator a later grade PUSH scales onto, so the
 * attach and push surfaces MUST compute it identically — otherwise a quiz
 * attached as N points could be pushed against a different denominator and post
 * the wrong fraction. Sharing one helper makes that drift impossible (it
 * previously lived as an inline `reduce(...) || 100` copied per surface).
 */
export function quizMaxPoints(questions: QuizQuestion[]): number {
  return questions.reduce((sum, q) => sum + (q.points ?? 1), 0) || 100;
}
