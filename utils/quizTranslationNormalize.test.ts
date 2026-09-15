import { describe, it, expect } from 'vitest';
import { normalizeQuizTranslation } from './quizTranslationNormalize';

describe('normalizeQuizTranslation', () => {
  it('coerces a hand-edited sidecar into the declared shape', () => {
    const raw = {
      locale: 'es',
      title: 42,
      questions: {
        q1: { text: 'Hola', choices: ['Uno', 7] },
        q2: 'not an object',
      },
      sourceHashes: { q1: 'abc', q2: 9 },
      reviewedQuestionIds: ['q1', 3],
      model: null,
      generatedAt: '1',
    };
    const out = normalizeQuizTranslation(raw);
    expect(out.title).toBe('');
    expect(out.questions.q1.choices).toEqual(['Uno', '']);
    expect(out.questions.q2).toEqual({ text: '' });
    expect(out.sourceHashes).toEqual({ q1: 'abc' });
    expect(out.reviewedQuestionIds).toEqual(['q1']);
    expect(out.model).toBe('');
    expect(typeof out.generatedAt).toBe('number');
    expect(out.updatedAt).toBe(out.generatedAt);
  });

  it('survives a truncated payload without throwing', () => {
    const out = normalizeQuizTranslation({ locale: 'so' });
    expect(out.questions).toEqual({});
    expect(out.sourceHashes).toEqual({});
    expect(out.reviewedQuestionIds).toEqual([]);
  });
  it('carries a FIB answer through, and drops a non-string one', () => {
    const out = normalizeQuizTranslation({
      questions: {
        q1: { text: 'La capital es ____.', answer: 'París' },
        q2: { text: 'x', answer: 7 },
      },
    });
    expect(out.questions.q1.answer).toBe('París');
    expect(out.questions.q2.answer).toBeUndefined();
  });
});
