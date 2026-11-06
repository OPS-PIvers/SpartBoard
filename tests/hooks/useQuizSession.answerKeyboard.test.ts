import { describe, it, expect } from 'vitest';
import { toPublicQuestion } from '@/hooks/useQuizSession';
import type { QuizQuestion } from '@/types';

const q = (extra: Partial<QuizQuestion>): QuizQuestion => ({
  id: 'q1',
  timeLimit: 0,
  text: 'Simplify 6/8.',
  type: 'FIB',
  correctAnswer: '3/4',
  incorrectAnswers: [],
  ...extra,
});

describe('toPublicQuestion answer keyboard', () => {
  it('projects the keyboard on fill in the blank and written questions', () => {
    expect(toPublicQuestion(q({ answerKeyboard: 'math' })).answerKeyboard).toBe(
      'math'
    );
    expect(
      toPublicQuestion(
        q({ type: 'free-response', correctAnswer: '', answerKeyboard: 'es' })
      ).answerKeyboard
    ).toBe('es');
  });

  it('omits it when unset, on other types, or when unknown', () => {
    expect(toPublicQuestion(q({}))).not.toHaveProperty('answerKeyboard');
    expect(
      toPublicQuestion(
        q({
          type: 'MC',
          correctAnswer: 'a',
          incorrectAnswers: ['b'],
          answerKeyboard: 'math',
        })
      )
    ).not.toHaveProperty('answerKeyboard');
    expect(
      toPublicQuestion(
        q({ answerKeyboard: 'xx' as unknown as QuizQuestion['answerKeyboard'] })
      )
    ).not.toHaveProperty('answerKeyboard');
  });
});
