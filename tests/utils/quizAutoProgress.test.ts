import { describe, expect, it } from 'vitest';
import { everyoneAnsweredQuestion } from '@/utils/quizAutoProgress';
import type { QuizResponse } from '@/types';

type Row = Pick<QuizResponse, 'status' | 'answers'>;

const row = (
  status: QuizResponse['status'],
  answers: Row['answers'] = []
): Row => ({ status, answers });

const submitted = { questionId: 'q1', answer: 'a', answeredAt: 1 };

describe('everyoneAnsweredQuestion', () => {
  it('waits for a student who joined but has not answered yet', () => {
    expect(
      everyoneAnsweredQuestion(
        [row('in-progress', [submitted]), row('joined')],
        'q1'
      )
    ).toBe(false);
  });

  it('does not count a draft as an answer', () => {
    expect(
      everyoneAnsweredQuestion(
        [row('in-progress', [{ ...submitted, status: 'draft' }])],
        'q1'
      )
    ).toBe(false);
  });

  it('counts submitted answers, legacy answers without a status, and skips finished students', () => {
    expect(
      everyoneAnsweredQuestion(
        [
          row('in-progress', [{ ...submitted, status: 'submitted' }]),
          row('in-progress', [submitted]),
          row('completed'),
        ],
        'q1'
      )
    ).toBe(true);
  });

  it('needs at least one student', () => {
    expect(everyoneAnsweredQuestion([], 'q1')).toBe(false);
    expect(everyoneAnsweredQuestion([row('completed')], 'q1')).toBe(false);
  });

  it('only looks at the current question', () => {
    expect(
      everyoneAnsweredQuestion(
        [row('in-progress', [{ ...submitted, questionId: 'q0' }])],
        'q1'
      )
    ).toBe(false);
  });
});
