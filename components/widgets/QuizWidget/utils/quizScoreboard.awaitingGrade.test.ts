/**
 * M12 3-G: isResponseAwaitingGrade — the gate that keeps an ungraded written
 * response out of gradebook pushes and marks its total provisional. Uses the
 * REAL gradeAnswer (unlike quizScoreboard.test.ts, which stubs it) because the
 * whole point is the `GradeResult.state` contract.
 */
import { describe, it, expect } from 'vitest';
import {
  isResponseAwaitingGrade,
  selectPushableResponses,
  getEarnedPoints,
} from './quizScoreboard';
import type { QuizQuestion, QuizResponse, Rubric } from '@/types';

const mc = (id: string): QuizQuestion => ({
  id,
  text: 'Pick one',
  timeLimit: 0,
  type: 'MC',
  correctAnswer: 'A',
  incorrectAnswers: ['B'],
  points: 1,
});

const rubric = (criterionIds: string[]): Rubric => ({
  id: 'rub-1',
  title: 'Essay rubric',
  criteria: criterionIds.map((id) => ({
    id,
    name: id,
    levels: [
      { id: `${id}-lo`, label: 'Below', points: 0 },
      { id: `${id}-hi`, label: 'Meets', points: 3 },
    ],
  })),
  createdAt: 0,
  updatedAt: 0,
});

const essay = (id: string, snapshot?: Rubric): QuizQuestion => ({
  id,
  text: 'Explain',
  timeLimit: 0,
  type: 'essay',
  correctAnswer: '',
  incorrectAnswers: [],
  points: 6,
  ...(snapshot ? { rubricSnapshot: snapshot } : {}),
});

const response = (
  answers: { questionId: string; answer: string; answeredAt?: number }[],
  grading?: QuizResponse['grading']
): QuizResponse =>
  ({
    pin: '01',
    studentUid: 'u1',
    status: 'completed',
    answers,
    ...(grading ? { grading } : {}),
  }) as unknown as QuizResponse;

describe('isResponseAwaitingGrade', () => {
  it('is false when every answered question is auto-graded', () => {
    const r = response([{ questionId: 'q1', answer: 'A' }]);
    expect(isResponseAwaitingGrade(r, [mc('q1')])).toBe(false);
  });

  it('is true when an answered essay has no teacher grade', () => {
    const r = response([{ questionId: 'e1', answer: 'my essay' }]);
    expect(isResponseAwaitingGrade(r, [essay('e1')])).toBe(true);
  });

  it('is false when the essay was left blank (a genuine 0, not owed a grade)', () => {
    const r = response([{ questionId: 'e1', answer: '   ' }]);
    expect(isResponseAwaitingGrade(r, [essay('e1')])).toBe(false);
  });

  it('is false once the essay carries a manual grade', () => {
    const r = response([{ questionId: 'e1', answer: 'my essay' }], {
      e1: { pointsAwarded: 4, gradedBy: 't1', gradedAt: 1 },
    });
    expect(isResponseAwaitingGrade(r, [essay('e1')])).toBe(false);
  });

  it('is true when a rubric grade leaves a criterion unscored (partial save)', () => {
    const snap = rubric(['c1', 'c2']);
    const r = response([{ questionId: 'e1', answer: 'my essay' }], {
      e1: {
        pointsAwarded: 3,
        rubricScores: [{ criterionId: 'c1', levelId: 'c1-hi', points: 3 }],
        gradedBy: 't1',
        gradedAt: 1,
      },
    });
    expect(isResponseAwaitingGrade(r, [essay('e1', snap)])).toBe(true);
  });

  it('is false when every rubric criterion has been scored', () => {
    const snap = rubric(['c1', 'c2']);
    const r = response([{ questionId: 'e1', answer: 'my essay' }], {
      e1: {
        pointsAwarded: 6,
        rubricScores: [
          { criterionId: 'c1', levelId: 'c1-hi', points: 3 },
          { criterionId: 'c2', levelId: 'c2-hi', points: 3 },
        ],
        gradedBy: 't1',
        gradedAt: 1,
      },
    });
    expect(isResponseAwaitingGrade(r, [essay('e1', snap)])).toBe(false);
  });

  it('ignores answers that map to no loaded question', () => {
    const r = response([{ questionId: 'gone', answer: 'my essay' }]);
    expect(isResponseAwaitingGrade(r, [mc('q1')])).toBe(false);
  });

  it('flags a mixed response when only the essay is ungraded', () => {
    const r = response([
      { questionId: 'q1', answer: 'A' },
      { questionId: 'e1', answer: 'my essay' },
    ]);
    expect(isResponseAwaitingGrade(r, [mc('q1'), essay('e1')])).toBe(true);
  });

  it('picks the same duplicate answer getEarnedPoints does (earliest answeredAt)', () => {
    // Raw array order puts the blank retry first; chronological order (what
    // getEarnedPoints credits) puts the real essay first.
    const r = response([
      { questionId: 'e1', answer: '<p><br></p>', answeredAt: 500 },
      { questionId: 'e1', answer: 'my essay', answeredAt: 100 },
    ]);
    const qs = [essay('e1')];
    expect(getEarnedPoints(r, qs)).toBe(0);
    expect(isResponseAwaitingGrade(r, qs)).toBe(true);
  });
});

describe('selectPushableResponses', () => {
  const qs = [mc('q1'), essay('e1')];

  it('keeps a response whose every answered question is scored', () => {
    const r = response([{ questionId: 'q1', answer: 'A' }]);
    expect(selectPushableResponses([r], qs)).toEqual([r]);
  });

  it('drops a response whose essay is still awaiting a teacher grade', () => {
    const graded = response([{ questionId: 'q1', answer: 'A' }]);
    const ungraded = response([
      { questionId: 'q1', answer: 'A' },
      { questionId: 'e1', answer: 'my essay' },
    ]);
    expect(selectPushableResponses([graded, ungraded], qs)).toEqual([graded]);
  });

  it('keeps the response once the essay carries a grade', () => {
    const r = response([{ questionId: 'e1', answer: 'my essay' }], {
      e1: { pointsAwarded: 6, gradedBy: 't1', gradedAt: 1 },
    });
    expect(selectPushableResponses([r], qs)).toEqual([r]);
  });

  it('drops a response that cannot be scored yet (answer key not loaded)', () => {
    const r = response([{ questionId: 'q1', answer: 'A' }]);
    expect(selectPushableResponses([r], [])).toEqual([]);
  });
});
