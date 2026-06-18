import { describe, it, expect } from 'vitest';
import { quizMaxPoints } from '@/utils/quizMaxPoints';
import type { QuizQuestion } from '@/types';

/**
 * quizMaxPoints is the single denominator frozen into an LMS line item at attach
 * AND scaled onto at grade-push, so the two surfaces can't drift. These pin the
 * defaulting contract any future edit must preserve.
 */
let _qCounter = 0;
/** Make a minimal QuizQuestion with a unique id so dedup tests are not trivially broken. */
const q = (points?: number): QuizQuestion =>
  ({ id: `q-${++_qCounter}`, points }) as unknown as QuizQuestion;

describe('quizMaxPoints', () => {
  it('sums per-question points', () => {
    expect(quizMaxPoints([q(2), q(3), q(5)])).toBe(10);
  });

  it('defaults a missing/undefined points to 1', () => {
    expect(quizMaxPoints([q(), q(), q(4)])).toBe(6);
  });

  it('falls back to 100 when there are no questions', () => {
    expect(quizMaxPoints([])).toBe(100);
  });

  it('falls back to 100 when the summed points are 0', () => {
    expect(quizMaxPoints([q(0), q(0)])).toBe(100);
  });

  it('deduplicates questions by id — Drive-sync duplicate guard', () => {
    // Drive-sync duplication or arrayUnion races can write the same question id
    // twice into `quiz.questions`. Without a dedup guard, the denominator
    // inflates (e.g. 10 + 10 = 20) while the push path's `buildQuizClassroomGradeEntries`
    // (which already deduplicates via its own seenIds Set) stays correct at 10.
    // The attach-time `scoreMaximum` is then 20 while the maximum a student can
    // ever earn is 10 — they can never achieve a perfect LMS grade.
    const dupQuestion: QuizQuestion = {
      id: 'q-dup',
      type: 'MC',
      points: 10,
    } as unknown as QuizQuestion;
    // Two entries with the SAME id simulate the Drive-sync duplicate.
    expect(quizMaxPoints([dupQuestion, dupQuestion])).toBe(10);
  });

  it('deduplicates mixed unique and duplicate questions', () => {
    // Ensure dedup only collapses the duplicate, not the distinct question.
    const dup: QuizQuestion = {
      id: 'dup',
      type: 'MC',
      points: 5,
    } as unknown as QuizQuestion;
    const unique: QuizQuestion = {
      id: 'unique',
      type: 'MC',
      points: 3,
    } as unknown as QuizQuestion;
    // [dup, dup, unique] → only dup(5) + unique(3) = 8
    expect(quizMaxPoints([dup, dup, unique])).toBe(8);
  });
});
