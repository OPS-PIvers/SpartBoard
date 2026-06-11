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
  // The builder now drops responses canScoreResponse rejects (answer key not
  // loaded / question-id drift → a phantom 0). Stub it off a per-response flag
  // so a test can mark one unscoreable; default true keeps the scaling tests
  // focused on scaling rather than the (separately tested) scoreability rule.
  canScoreResponse: (r: unknown) =>
    (r as { __scoreable?: boolean }).__scoreable !== false,
}));

import { buildQuizClassroomGradeEntries } from '@/utils/classroomGradePush';

/** Minimal question carrying only the `points` the scaler reads. */
const q = (points: number): QuizQuestion =>
  ({ id: `q${points}`, type: 'MC', points }) as unknown as QuizQuestion;

/**
 * Minimal response carrying status/studentUid + a stubbed earned score.
 * `scoreable` defaults true; pass false to simulate an unscoreable response
 * (the mocked canScoreResponse reads `__scoreable`).
 */
const resp = (
  studentUid: string,
  status: QuizResponse['status'],
  earned: number,
  scoreable = true
): QuizResponse =>
  ({
    studentUid,
    status,
    __earned: earned,
    __scoreable: scoreable,
  }) as unknown as QuizResponse;

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

  it('excludes a completed response that cannot be scored (no phantom 0 to the gradebook)', () => {
    // A completed response whose answers map to no loaded question (synced-quiz
    // id drift, or answer key not loaded) scores a phantom 0 via getEarnedPoints.
    // It must be OMITTED from the push — not written as 0/maxPoints to the real
    // Classroom gradebook, where it is persistent and hard to notice/undo.
    const grades = buildQuizClassroomGradeEntries(
      [
        resp('u1', 'completed', 8),
        resp('drift', 'completed', 0, /* scoreable */ false),
      ],
      [q(10)],
      10
    );
    expect(grades).toEqual([{ pseudonymUid: 'u1', pointsEarned: 8 }]);
  });

  it('scales on correctness points only — getEarnedPoints is called with NO session (excludes speed/streak bonuses)', () => {
    getEarnedPointsMock.mockClear();
    buildQuizClassroomGradeEntries([resp('u1', 'completed', 10)], [q(10)], 10);
    expect(getEarnedPointsMock).toHaveBeenCalledTimes(1);
    // A session as the 3rd arg would re-enable gamification bonuses; the builder
    // must omit it so the gradebook grade reflects mastery, not answer speed.
    expect(getEarnedPointsMock.mock.calls[0][2]).toBeUndefined();
  });

  it('deduplicates questions by id before summing currentTotal (Drive-sync duplicate guard)', () => {
    // Drive-sync duplication or arrayUnion races can write the same question id
    // twice into the quiz's questions array. Without a dedup guard, currentTotal
    // inflates (10 + 10 = 20) while getEarnedPoints stays correct (it builds a
    // Map that naturally deduplicates by id, so earned = 10 for a perfect answer).
    // The scaling (earned / currentTotal) * maxPoints then understates the grade:
    //   bugged:   (10 / 20) * 10 = 5  ← wrong (50% instead of 100%)
    //   correct:  (10 / 10) * 10 = 10 ← correct
    const dupQuestion: QuizQuestion = {
      id: 'q-dup',
      type: 'MC',
      points: 10,
    } as unknown as QuizQuestion;
    // Two entries with the SAME id simulate the Drive-sync duplicate.
    const questions = [dupQuestion, dupQuestion];
    // The mock returns __earned; set it to the correct single-question earned
    // value (10 pts) — matching what getEarnedPoints produces when its qMap
    // deduplicates the question to one entry.
    const response = resp('u1', 'completed', 10);
    const grades = buildQuizClassroomGradeEntries([response], questions, 10);
    // A student who earned 10/10 on the only real question should push 10/10.
    expect(grades).toEqual([{ pseudonymUid: 'u1', pointsEarned: 10 }]);
  });
});
