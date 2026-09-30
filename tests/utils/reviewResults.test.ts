import { describe, it, expect } from 'vitest';
import type { QuizQuestion, QuizResponse, QuizSession } from '@/types';
import {
  buildReviewRanking,
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
