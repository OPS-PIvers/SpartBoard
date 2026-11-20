import { describe, it, expect, vi } from 'vitest';
import type { QuizData, QuizResponse } from '@/types';

vi.mock('firebase/firestore', () => ({
  deleteField: () => '__delete__',
}));

import {
  buildResponseGradingContext,
  classPublishPatch,
  gradeResponseForPublish,
  refreshedKeyFields,
} from '@/hooks/quizAssignments/publishGrading';

const q = (id: string, answer: string) => ({
  id,
  timeLimit: 0,
  text: id,
  type: 'MC' as const,
  correctAnswer: answer,
  incorrectAnswers: ['x', 'y'],
  explanation: `why ${id}`,
});
const quiz = {
  id: 'quiz',
  title: 'Q',
  questions: [q('q0', 'a'), q('q1', 'b'), q('q2', 'c')],
  createdAt: 0,
  updatedAt: 0,
} as unknown as QuizData;

const response = (extra: Partial<QuizResponse> = {}) =>
  ({
    studentUid: 's1',
    status: 'completed',
    answers: [{ questionId: 'q0', answer: 'a', answeredAt: 1 }],
    ...extra,
  }) as unknown as QuizResponse;

const opts = {
  visibility: 'score-responses-and-answers' as const,
  now: 1,
  answerKey: { q0: 'a', q1: 'b', q2: 'c' },
  rubricExamples: null,
  explanations: null,
};

describe('answer key limited to served questions', () => {
  it('keeps only the snapshot questions on a class publish', () => {
    const data = response({ servedQuestionIds: ['q0', 'q2'] });
    const ctx = buildResponseGradingContext(quiz, undefined);
    const patch = classPublishPatch(
      data,
      gradeResponseForPublish(data, ctx, 'k'),
      opts
    );
    expect(patch.revealedAnswers).toEqual({ q0: 'a', q2: 'c' });
  });

  it('falls back to the override subset when there is no snapshot', () => {
    const data = response();
    const ctx = buildResponseGradingContext(quiz, {
      overridesByStudentUid: { s1: { questionIds: ['q1'] } },
    });
    const patch = classPublishPatch(
      data,
      gradeResponseForPublish(data, ctx, 'k'),
      opts
    );
    expect(patch.revealedAnswers).toEqual({ q1: 'b' });
  });

  it('gives a plain quiz the full key', () => {
    const data = response();
    const ctx = buildResponseGradingContext(quiz, undefined);
    const patch = classPublishPatch(
      data,
      gradeResponseForPublish(data, ctx, 'k'),
      opts
    );
    expect(patch.revealedAnswers).toEqual(opts.answerKey);
  });

  it('gives a bank-draw response with no snapshot no key, without changing its score', () => {
    const data = response();
    const plain = gradeResponseForPublish(
      data,
      buildResponseGradingContext(quiz, undefined),
      'k'
    );
    const ctx = buildResponseGradingContext(quiz, {
      bankSlots: [{ id: 'slot' }],
    });
    const graded = gradeResponseForPublish(data, ctx, 'k');
    expect(graded.score).toBe(plain.score);
    expect(classPublishPatch(data, graded, opts).revealedAnswers).toBe(
      '__delete__'
    );
  });

  it('refreshes a key already on the response, and its override copy, to the new counted set', () => {
    const data = response({
      servedQuestionIds: ['q0', 'q1'],
      revealedAnswers: { q0: 'a' },
      resultsOverride: {
        mode: 'shown',
        visibility: 'score-responses-and-answers',
        publishedAt: 1,
        revealedAnswers: { q0: 'a' },
      },
    } as never);
    const ctx = buildResponseGradingContext(quiz, undefined);
    const fields = refreshedKeyFields(
      data,
      gradeResponseForPublish(data, ctx, 'k'),
      quiz,
      'k'
    );
    expect(fields).toEqual({
      revealedAnswers: { q0: 'a', q1: 'b' },
      'resultsOverride.revealedAnswers': { q0: 'a', q1: 'b' },
    });
  });

  it('writes nothing when the response holds no key', () => {
    const data = response();
    const ctx = buildResponseGradingContext(quiz, undefined);
    expect(
      refreshedKeyFields(
        data,
        gradeResponseForPublish(data, ctx, 'k'),
        quiz,
        'k'
      )
    ).toEqual({});
  });
});
