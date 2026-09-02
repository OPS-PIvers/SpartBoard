import { describe, it, expect } from 'vitest';
import { toPublicQuestion } from '@/hooks/useQuizSession';
import type { QuizQuestion } from '@/types';

const written = (extra: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q-written',
  timeLimit: 0,
  text: 'Explain your reasoning',
  type: 'free-response',
  correctAnswer: '',
  incorrectAnswers: [],
  ...extra,
});

describe('toPublicQuestion word limits', () => {
  it('projects minWords, maxWords and enforceWordLimit', () => {
    const pub = toPublicQuestion(
      written({ minWords: 100, maxWords: 200, enforceWordLimit: true })
    );
    expect(pub.minWords).toBe(100);
    expect(pub.maxWords).toBe(200);
    expect(pub.enforceWordLimit).toBe(true);
  });

  it('omits every word-limit key when unset', () => {
    const pub = toPublicQuestion(written());
    expect(pub).not.toHaveProperty('minWords');
    expect(pub).not.toHaveProperty('maxWords');
    expect(pub).not.toHaveProperty('enforceWordLimit');
  });

  it('omits zero bounds', () => {
    const pub = toPublicQuestion(written({ minWords: 0, maxWords: 0 }));
    expect(pub).not.toHaveProperty('minWords');
    expect(pub).not.toHaveProperty('maxWords');
  });

  it('drops enforceWordLimit when no bound survives projection', () => {
    const pub = toPublicQuestion(
      written({ minWords: 0, maxWords: 0, enforceWordLimit: true })
    );
    expect(pub).not.toHaveProperty('enforceWordLimit');
  });

  it('never projects word limits onto a non-written question', () => {
    const pub = toPublicQuestion({
      id: 'q-mc',
      timeLimit: 0,
      text: 'Pick',
      type: 'MC',
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
      minWords: 10,
      maxWords: 20,
      enforceWordLimit: true,
    });
    expect(pub).not.toHaveProperty('minWords');
    expect(pub).not.toHaveProperty('maxWords');
    expect(pub).not.toHaveProperty('enforceWordLimit');
  });
});
