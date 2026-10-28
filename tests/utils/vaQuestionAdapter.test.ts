import { describe, expect, it } from 'vitest';
import type { VideoActivityQuestion } from '@/types';
import { quizUpdatesToVa, vaToQuizQuestion } from '@/utils/vaQuestionAdapter';

const fib: VideoActivityQuestion = {
  id: 'q1',
  type: 'FIB',
  text: 'Spell the hue',
  timestamp: 42,
  timeLimit: 0,
  correctAnswer: 'color',
  incorrectAnswers: [],
  acceptableVariants: ['colour'],
  points: 2,
};

describe('vaToQuizQuestion', () => {
  it('maps accepted variants to alternate answers and drops the timestamp', () => {
    const q = vaToQuizQuestion(fib);
    expect(q.alternateAnswers).toEqual(['colour']);
    expect(q).not.toHaveProperty('acceptableVariants');
    expect(q).not.toHaveProperty('timestamp');
    expect(q).toMatchObject({ id: 'q1', type: 'FIB', points: 2 });
  });

  it('leaves alternate answers off when there are no variants', () => {
    const q = vaToQuizQuestion({ ...fib, acceptableVariants: [] });
    expect(q).not.toHaveProperty('alternateAnswers');
  });
});

describe('quizUpdatesToVa', () => {
  it('maps alternate answers back to accepted variants, including clearing them', () => {
    expect(quizUpdatesToVa({ alternateAnswers: ['colour'] })).toEqual({
      acceptableVariants: ['colour'],
    });
    expect(quizUpdatesToVa({ alternateAnswers: undefined })).toEqual({
      acceptableVariants: undefined,
    });
  });

  it('refuses a type VA cannot play', () => {
    expect(quizUpdatesToVa({ type: 'Matching' })).toBeNull();
    expect(quizUpdatesToVa({ type: 'free-response' })).toBeNull();
  });

  it('drops fields VA never stores', () => {
    expect(
      quizUpdatesToVa({
        type: 'MC',
        correctAnswer: '',
        incorrectAnswers: ['', ''],
        optionOrder: [1, 0],
        blankAlternates: [],
        placeholder: undefined,
        rubricSnapshot: undefined,
      })
    ).toEqual({ type: 'MC', correctAnswer: '', incorrectAnswers: ['', ''] });
  });

  it('round-trips an MA edit with partial credit', () => {
    expect(
      quizUpdatesToVa({
        type: 'MA',
        correctAnswer: 'a|b',
        incorrectAnswers: ['c'],
        allowPartialCredit: true,
      })
    ).toEqual({
      type: 'MA',
      correctAnswer: 'a|b',
      incorrectAnswers: ['c'],
      allowPartialCredit: true,
    });
  });
});
