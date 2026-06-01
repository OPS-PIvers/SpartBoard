/**
 * Unit coverage for buildQuizClassroomGradeEntries — the shared scaling that
 * turns quiz responses into the Classroom grade payload. This is the single
 * source of truth for both QuizResults (dashboard) and TeacherReviewRoute
 * (in-iframe grader), so the scaling/clamp/finite-guard behavior is pinned here
 * once. getEarnedPoints is mocked to a controllable per-response value so these
 * tests exercise the scaling layer, not the (separately tested) scoring engine.
 */
import { describe, it, expect, vi } from 'vitest';
import type { QuizQuestion, QuizResponse } from '@/types';

// Hoisted spy so a test can assert HOW getEarnedPoints is invoked (specifically
// that the builder passes NO session → speed/streak bonuses are excluded).
const { getEarnedPointsMock } = vi.hoisted(() => ({
  // Rest args so a test can inspect the 3rd positional (session) the builder
  // passes — it must be undefined (no gamification bonuses in the grade).
  getEarnedPointsMock: vi.fn(
    (...args: unknown[]) => (args[0] as { __earned: number }).__earned
  ),
}));
vi.mock('@/components/widgets/QuizWidget/utils/quizScoreboard', () => ({
  getEarnedPoints: getEarnedPointsMock,
}));

import { buildQuizClassroomGradeEntries } from '@/utils/classroomGradePush';

/** Minimal question carrying only the `points` the scaler reads. */
const q = (points: number): QuizQuestion =>
  ({ id: `q${points}`, type: 'MC', points }) as unknown as QuizQuestion;

/** Minimal response carrying status/studentUid + a stubbed earned score. */
const resp = (
  studentUid: string,
  status: QuizResponse['status'],
  earned: number
): QuizResponse =>
  ({ studentUid, status, __earned: earned }) as unknown as QuizResponse;

describe('buildQuizClassroomGradeEntries', () => {
  it('is an identity scale when the quiz total equals maxPoints', () => {
    const grades = buildQuizClassroomGradeEntries(
      [resp('u1', 'completed', 17)],
      [q(20)],
      20
    );
    expect(grades).toEqual([{ pseudonymUid: 'u1', pointsEarned: 17 }]);
  });

  it('rescales onto maxPoints when the quiz total drifts (edited after attach)', () => {
    // earned 5 of total 10, scaled onto a frozen maxPoints of 20 → 10.
    const grades = buildQuizClassroomGradeEntries(
      [resp('u1', 'completed', 5)],
      [q(10)],
      20
    );
    expect(grades[0].pointsEarned).toBe(10);
  });

  it('rounds, and clamps to [0, maxPoints]', () => {
    // 1 of 3 onto 10 → 3.33 → round 3.
    expect(
      buildQuizClassroomGradeEntries([resp('u', 'completed', 1)], [q(3)], 10)[0]
        .pointsEarned
    ).toBe(3);
    // earned beyond the total clamps to maxPoints.
    expect(
      buildQuizClassroomGradeEntries(
        [resp('u', 'completed', 99)],
        [q(10)],
        10
      )[0].pointsEarned
    ).toBe(10);
  });

  it('treats a non-finite earned score as 0 (never propagates NaN)', () => {
    const grades = buildQuizClassroomGradeEntries(
      [resp('u', 'completed', Number.NaN)],
      [q(10)],
      10
    );
    expect(grades[0].pointsEarned).toBe(0);
    expect(Number.isNaN(grades[0].pointsEarned)).toBe(false);
  });

  it('returns 0 when the quiz total is 0 (no divide-by-zero)', () => {
    const grades = buildQuizClassroomGradeEntries(
      [resp('u', 'completed', 5)],
      [q(0)],
      10
    );
    expect(grades[0].pointsEarned).toBe(0);
  });

  it('includes only completed responses with a resolvable pseudonym', () => {
    const grades = buildQuizClassroomGradeEntries(
      [
        resp('u1', 'completed', 5),
        resp('u2', 'in-progress', 5),
        resp('', 'completed', 5),
      ],
      [q(10)],
      10
    );
    expect(grades).toEqual([{ pseudonymUid: 'u1', pointsEarned: 5 }]);
  });

  it('scales on correctness points only — getEarnedPoints is called with NO session (excludes speed/streak bonuses)', () => {
    getEarnedPointsMock.mockClear();
    buildQuizClassroomGradeEntries([resp('u1', 'completed', 10)], [q(10)], 10);
    expect(getEarnedPointsMock).toHaveBeenCalledTimes(1);
    // A session as the 3rd arg would re-enable gamification bonuses; the builder
    // must omit it so the gradebook grade reflects mastery, not answer speed.
    expect(getEarnedPointsMock.mock.calls[0][2]).toBeUndefined();
  });
});
