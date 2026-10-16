import { describe, expect, it } from 'vitest';
import { buildTeacherSubmitUpdate } from '@/utils/quizTeacherSubmit';
import { buildQuizFinalizeUpdate } from '@/functions/src/quizFinalize';
import type { QuizResponse } from '@/types';

const NOW = 1_700_000_000_000;

type Row = Pick<
  QuizResponse,
  'status' | 'answers' | 'completedAttempts' | 'servedQuestionIds'
>;

const cases: [string, Row][] = [
  ['blank joined', { status: 'joined', answers: [] }],
  [
    'drafts and submits',
    {
      status: 'in-progress',
      completedAttempts: 1,
      answers: [
        { questionId: 'q1', answer: 'a', answeredAt: 1, status: 'draft' },
        { questionId: 'q2', answer: 'b', answeredAt: 2, status: 'submitted' },
      ],
    },
  ],
  [
    'served subset',
    {
      status: 'in-progress',
      servedQuestionIds: ['q2', 'q3'],
      answers: [{ questionId: 'q2', answer: 'b', answeredAt: 2 }],
    },
  ],
  ['already completed', { status: 'completed', answers: [] }],
];

describe('quiz finalize: client and server agree', () => {
  for (const completenessModel of [0, 1]) {
    const session = { questionIds: ['q1', 'q2', 'q3'], completenessModel };
    for (const [name, response] of cases) {
      it(`${name}, completenessModel ${completenessModel}`, () => {
        expect(buildQuizFinalizeUpdate(response, session, NOW)).toEqual(
          buildTeacherSubmitUpdate(response, session, NOW)
        );
      });
    }
  }
});
