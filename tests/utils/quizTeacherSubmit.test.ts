import { describe, expect, it } from 'vitest';
import {
  buildTeacherSubmitUpdate,
  canTeacherSubmit,
} from '@/utils/quizTeacherSubmit';
import type { QuizResponse } from '@/types';

const NOW = 1_700_000_000_000;
const session = { questionIds: ['q1', 'q2', 'q3'], completenessModel: 1 };

const response = (
  over: Partial<QuizResponse> = {}
): Pick<
  QuizResponse,
  'status' | 'answers' | 'completedAttempts' | 'servedQuestionIds'
> => ({
  status: 'in-progress',
  answers: [],
  completedAttempts: 0,
  ...over,
});

describe('canTeacherSubmit', () => {
  it('allows joined and in-progress only', () => {
    expect(canTeacherSubmit({ status: 'joined' })).toBe(true);
    expect(canTeacherSubmit({ status: 'in-progress' })).toBe(true);
    expect(canTeacherSubmit({ status: 'completed' })).toBe(false);
  });
});

describe('buildTeacherSubmitUpdate', () => {
  it('returns null for an already submitted response', () => {
    expect(
      buildTeacherSubmitUpdate(response({ status: 'completed' }), session, NOW)
    ).toBeNull();
  });

  it('turns autosaved drafts into submitted answers and counts the attempt', () => {
    const update = buildTeacherSubmitUpdate(
      response({
        completedAttempts: 1,
        answers: [
          { questionId: 'q1', answer: 'A', answeredAt: 1, status: 'submitted' },
          { questionId: 'q2', answer: 'typed', answeredAt: 2, status: 'draft' },
        ],
      }),
      session,
      NOW
    );
    expect(update).toMatchObject({
      status: 'completed',
      submittedAt: NOW,
      unlocked: false,
      completedAttempts: 2,
    });
    const answers = update?.answers as QuizResponse['answers'];
    expect(answers.find((a) => a.questionId === 'q2')).toMatchObject({
      answer: 'typed',
      status: 'submitted',
    });
    expect(answers.find((a) => a.questionId === 'q3')).toMatchObject({
      answer: '',
      status: 'submitted',
      unresponded: 'abandoned',
    });
  });

  it('marks only the served questions as abandoned', () => {
    const update = buildTeacherSubmitUpdate(
      response({
        servedQuestionIds: ['q1', 'q3'],
        answers: [{ questionId: 'q1', answer: 'A', answeredAt: 1 }],
      }),
      session,
      NOW
    );
    const ids = (update?.answers as QuizResponse['answers']).map(
      (a) => a.questionId
    );
    expect(ids).toEqual(['q1', 'q3']);
  });

  it('adds no markers on sessions without the completeness model', () => {
    const update = buildTeacherSubmitUpdate(
      response({ answers: [{ questionId: 'q1', answer: 'A', answeredAt: 1 }] }),
      { questionIds: session.questionIds },
      NOW
    );
    expect(update?.answers).toHaveLength(1);
  });

  it('uses no attempt for a student who never answered', () => {
    const update = buildTeacherSubmitUpdate(
      response({ status: 'joined', completedAttempts: 0 }),
      session,
      NOW
    );
    expect(update?.status).toBe('completed');
    expect(update).not.toHaveProperty('completedAttempts');
  });
});
