// PR4 round-2: the FIB publish gate, and the projection that honours it.

import { describe, it, expect } from 'vitest';
import type { QuestionTranslation, QuizQuestion } from '@/types';
import { countFibBlanks, fibTranslationIssue } from './quizFibTranslation';
import { selectQuestionTranslations } from '@/hooks/useQuizAssignments';

const fib = (): QuizQuestion =>
  ({
    id: 'q1',
    type: 'FIB',
    text: 'The capital of France is ____.',
    correctAnswer: 'Paris',
    incorrectAnswers: [],
    timeLimit: 0,
  }) as unknown as QuizQuestion;

const sidecar = (entry: QuestionTranslation) => ({
  es: {
    locale: 'es',
    title: 'T',
    questions: { q1: entry },
    sourceHashes: { q1: 'h' },
    reviewedQuestionIds: ['q1'],
    model: 'm',
    generatedAt: 1,
    updatedAt: 1,
  },
});

const fresh = { es: new Set(['q1']) };

describe('countFibBlanks', () => {
  it('counts runs of two or more underscores', () => {
    expect(countFibBlanks('a ____ b ______ c _ d')).toBe(2);
    expect(countFibBlanks('')).toBe(0);
  });
});

describe('fibTranslationIssue', () => {
  it('flags a blank answer key while English has one', () => {
    expect(fibTranslationIssue(fib(), { text: 'La capital es ____.' })).toBe(
      'missingAnswer'
    );
  });

  it('allows a blank answer key when English has none', () => {
    expect(
      fibTranslationIssue(
        { ...fib(), correctAnswer: '  ' },
        { text: 'La capital es ____.' }
      )
    ).toBeNull();
  });

  it('flags a changed blank count', () => {
    expect(
      fibTranslationIssue(fib(), {
        text: 'La capital es París.',
        answer: 'París',
      })
    ).toBe('blankCount');
  });

  it('passes a well-formed entry, and ignores non-FIB types', () => {
    expect(
      fibTranslationIssue(fib(), {
        text: 'La capital es ____.',
        answer: 'París',
      })
    ).toBeNull();
    expect(
      fibTranslationIssue({ ...fib(), type: 'MC' } as QuizQuestion, {
        text: 'x',
      })
    ).toBeNull();
  });
});

describe('selectQuestionTranslations — FIB gate', () => {
  it('drops a FIB locale entry missing its answer key', () => {
    expect(
      selectQuestionTranslations(
        'q1',
        sidecar({ text: 'La capital es ____.' }),
        fresh,
        fib()
      )
    ).toBeUndefined();
  });

  it('keeps a complete FIB locale entry', () => {
    const entry = { text: 'La capital es ____.', answer: 'París' };
    expect(
      selectQuestionTranslations('q1', sidecar(entry), fresh, fib())
    ).toEqual({ es: entry });
  });
});
