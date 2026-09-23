/**
 * Regression test: buildQuizClassroomGradeEntries mixed duplicate-question-id
 * resolution between its numerator and its denominator.
 *
 * Bug: a Drive-sync/arrayUnion race can write the same question id twice into
 * a quiz's `questions` array (documented at length in `utils/quizMaxPoints.ts`
 * and mirrored across this codebase — session creation dedupes via
 * `dedupeQuestionsById`, which keeps the FIRST occurrence). Inside
 * `buildQuizClassroomGradeEntries`, the numerator (`getEarnedPoints`, from
 * `quizScoreboard.ts`) resolves a duplicate id via `new Map(questions.map(q
 * => [q.id, q]))`, which keeps the LAST occurrence, while the denominator
 * (`denominatorFor`'s own `seenIds` Set) kept the FIRST. When the two
 * duplicate entries carry different `points` values, the numerator and
 * denominator are computed against two different point weights for the same
 * question — the mixed basis can inflate a pushed Google Classroom / Schoology
 * grade well past what the student actually earned.
 *
 * Fix: dedupe `questions` once (via the shared, first-wins `dedupeQuestionsById`)
 * before computing either the numerator or the denominator, so both read the
 * same representative question.
 */
import { describe, it, expect, vi } from 'vitest';
import type { QuizQuestion, QuizResponse } from '@/types';

// Only fake the leaf-level MC comparison + a config import that would
// otherwise pull in unrelated color constants; everything else in the
// getEarnedPoints/canScoreResponse/isResponseAwaitingGrade chain is real, so
// this test exercises the actual duplicate-id resolution, not a stand-in.
vi.mock('@/hooks/useQuizSession', () => ({
  gradeAnswer: (
    question: { correctAnswer: string; type: string; points?: number },
    answer: string
  ) => {
    const norm = (s: string) => s.trim().toLowerCase();
    const isCorrect = norm(question.correctAnswer) === norm(answer);
    const max = question.points ?? 1;
    return {
      isCorrect,
      pointsEarned: isCorrect ? max : 0,
      pointsMax: max,
      state: 'scored',
    };
  },
}));
vi.mock('@/config/scoreboard', () => ({
  SCOREBOARD_COLORS: ['bg-blue-500'],
}));

import { buildQuizClassroomGradeEntries } from '@/utils/classroomGradePush';

describe('buildQuizClassroomGradeEntries — duplicate question id, differing points', () => {
  it('does not inflate the pushed grade when a duplicate question id carries a different points value', () => {
    // q0 appears twice (arrayUnion race): first occurrence worth 1 point
    // (what the student was actually served/graded against conceptually),
    // duplicate occurrence worth 4 points. q1 is a normal single 1-point
    // question the student answers WRONG.
    const questions: QuizQuestion[] = [
      {
        id: 'q0',
        type: 'MC',
        text: 'Q0',
        correctAnswer: 'a',
        incorrectAnswers: ['b', 'c', 'd'],
        timeLimit: 30,
        points: 1,
      },
      {
        id: 'q0',
        type: 'MC',
        text: 'Q0',
        correctAnswer: 'a',
        incorrectAnswers: ['b', 'c', 'd'],
        timeLimit: 30,
        points: 4,
      },
      {
        id: 'q1',
        type: 'MC',
        text: 'Q1',
        correctAnswer: 'a',
        incorrectAnswers: ['b', 'c', 'd'],
        timeLimit: 30,
        points: 1,
      },
    ] as unknown as QuizQuestion[];

    const response = {
      studentUid: 'u1',
      status: 'completed',
      answers: [
        { questionId: 'q0', answer: 'a', answeredAt: 1 },
        { questionId: 'q1', answer: 'wrong', answeredAt: 2 },
      ],
    } as unknown as QuizResponse;

    // maxPoints frozen at attach time — quizMaxPoints dedupes first-wins, so
    // q0 counts once at 1 point: total = 1 (q0) + 1 (q1) = 2.
    const maxPoints = 2;

    const grades = buildQuizClassroomGradeEntries(
      [response],
      questions,
      maxPoints
    );

    // The student answered q0 correctly and q1 incorrectly — exactly 1 of 2
    // questions right. Any single consistent dedup convention (first-wins OR
    // last-wins, applied to BOTH the numerator and the denominator) scores
    // this as 50%: 1 of 2 points. Mixing conventions instead scores 100%
    // (a phantom perfect score) because the LAST-wins numerator credits q0
    // with 4 points while the FIRST-wins denominator/maxPoints only expected
    // 1 — the inflated earned score clamps up to the full maxPoints and the
    // wrong q1 answer's damage disappears entirely.
    expect(grades).toEqual([{ pseudonymUid: 'u1', pointsEarned: 1 }]);
  });
});
