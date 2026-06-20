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
 *
 * Deduplicates by question id — Drive-sync or arrayUnion races can write the
 * same question id twice. Without the guard the denominator is inflated (e.g.
 * 4 instead of 2) while `buildQuizClassroomGradeEntries` (which already
 * deduplicates via its own `seenIds` Set) stays correct, producing a line item
 * `scoreMaximum` that is larger than the actual point total a student can ever
 * earn. A student who answers every question correctly then pushes a grade of
 * `(earned / currentTotal) * inflatedMaxPoints`, which rounds to LESS than
 * `inflatedMaxPoints` in the gradebook — they can never achieve a perfect
 * score. Mirrors the identical fence in `videoActivityMaxPoints` (#2000) and
 * `buildContributionDoc` (#1777).
 */
export function quizMaxPoints(questions: QuizQuestion[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const q of questions) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    total += q.points ?? 1;
  }
  return total || 100;
}
