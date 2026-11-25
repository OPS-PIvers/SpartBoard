import { describe, it, expect } from 'vitest';
import type { QuizQuestion, QuizResponse, QuizSession } from '@/types';
import {
  buildReviewRanking,
  classAverage,
  classStatResponses,
  classFirstTryAccuracy,
  gameFirstTry,
  isResultsFinished,
  resultsDisplayScore,
} from '@/utils/reviewResults';

const questions = [
  {
    id: 'q1',
    type: 'MC',
    text: 'Q1',
    correctAnswer: 'a',
    incorrectAnswers: ['b'],
    timeLimit: 30,
    points: 1,
  },
] as QuizQuestion[];

const game = { sessionMode: 'game' } as QuizSession;
const paced = { sessionMode: 'teacher' } as QuizSession;

const resp = (
  uid: string,
  points: number,
  firstTry: Record<string, boolean>,
  status = 'in-progress'
) =>
  ({
    studentUid: uid,
    status,
    answers: [{ questionId: 'q1', answer: 'a', answeredAt: 1 }],
    game: {
      points,
      streak: 0,
      answered: Object.keys(firstTry).length,
      correct: 0,
      firstTry,
      lastCorrect: firstTry,
      last: null,
    },
  }) as unknown as QuizResponse;

describe('reviewResults', () => {
  it('scores a game from server points, not the answer key', () => {
    expect(resultsDisplayScore(resp('a', 3.456, {}), [], game)).toBe(346);
    expect(resultsDisplayScore(resp('a', 3, {}), questions, paced)).toBe(100);
  });

  it('counts an answered game student as finished without End', () => {
    expect(isResultsFinished(resp('a', 1, { q1: true }), game)).toBe(true);
    expect(isResultsFinished(resp('a', 0, {}), game)).toBe(false);
    expect(isResultsFinished(resp('a', 1, { q1: true }), paced)).toBe(false);
  });

  it('tallies first tries per student and for the class', () => {
    const a = resp('a', 1, { q1: true, q2: false });
    const b = resp('b', 1, { q1: true });
    expect(gameFirstTry(a)).toEqual({ correct: 1, tried: 2 });
    expect(classFirstTryAccuracy([a, b])).toBe(67);
    expect(classFirstTryAccuracy([])).toBeNull();
  });

  it('ranks by points and lets ties share a rank', () => {
    const rows = buildReviewRanking(
      [
        resp('a', 2, { q1: true }),
        resp('b', 5, { q1: true }),
        resp('c', 2, { q1: false }),
        resp('d', 0, {}),
      ],
      questions,
      game
    );
    expect(rows.map((r) => [r.response.studentUid, r.rank])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
    ]);
  });
});

describe('classAverage (AB-389)', () => {
  const qs = [
    questions[0],
    {
      id: 'q2',
      type: 'free-response',
      text: 'Explain',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      points: 1,
    },
  ] as QuizQuestion[];
  const done = (answers: QuizResponse['answers'], grading = {}) =>
    ({
      studentUid: 'u',
      status: 'completed',
      answers,
      grading,
    }) as unknown as QuizResponse;
  const graded = done(
    [
      { questionId: 'q1', answer: 'a' },
      { questionId: 'q2', answer: 'Because' },
    ] as QuizResponse['answers'],
    { q2: { pointsAwarded: 1, gradedBy: 't', gradedAt: 1 } }
  );
  const ungraded = done([
    { questionId: 'q1', answer: 'a' },
    { questionId: 'q2', answer: 'Because' },
  ] as QuizResponse['answers']);

  it('counts an ungraded answer as 0 and marks the average provisional', () => {
    expect(classAverage([graded, ungraded], qs, paced, null, false)).toEqual({
      average: 75,
      provisional: true,
      skipped: 0,
    });
  });

  it('skips students awaiting a grade when asked', () => {
    expect(classAverage([graded, ungraded], qs, paced, null, true)).toEqual({
      average: 100,
      provisional: false,
      skipped: 1,
    });
  });

  it('has no average when every student is awaiting a grade', () => {
    expect(classAverage([ungraded], qs, paced, null, true)).toEqual({
      average: null,
      provisional: false,
      skipped: 1,
    });
  });

  it('leaves the same students out of the score distribution', () => {
    expect(classStatResponses([graded, ungraded], qs, paced, true)).toEqual([
      graded,
    ]);
    expect(classStatResponses([graded, ungraded], qs, paced, false)).toEqual([
      graded,
      ungraded,
    ]);
  });
});
