import { describe, it, expect } from 'vitest';
import { quizMaxPoints } from '@/utils/quizMaxPoints';
import type { QuizQuestion } from '@/types';

/**
 * quizMaxPoints is the single denominator frozen into an LMS line item at attach
 * AND scaled onto at grade-push, so the two surfaces can't drift. These pin the
 * defaulting contract any future edit must preserve.
 */
const q = (points?: number): QuizQuestion =>
  ({ id: 'x', points }) as unknown as QuizQuestion;

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
});
