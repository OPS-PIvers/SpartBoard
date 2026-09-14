// PR4: the assign-time FIB answer-key snapshot and the grader's accepted list.

import { describe, it, expect } from 'vitest';
import type { QuizQuestion, QuizTranslation } from '@/types';
import {
  collectLocalizedFibAnswers,
  fibAcceptedAnswers,
  fibAnswersForResponse,
  servedLocaleForResponse,
} from './quizFibAnswers';
import { normalizeQuizTranslation } from './quizTranslationNormalize';
import { gradeAnswer } from '@/hooks/useQuizSession';

const fib = (): QuizQuestion =>
  ({
    id: 'q1',
    type: 'FIB',
    text: 'The capital of France is ____.',
    correctAnswer: 'Paris',
    incorrectAnswers: [],
    timeLimit: 0,
  }) as unknown as QuizQuestion;

const sidecar = (over: Partial<QuizTranslation> = {}): QuizTranslation =>
  ({
    locale: 'es',
    title: 'Números',
    questions: {
      q1: { text: 'La capital de Francia es ____.', answer: 'París' },
    },
    sourceHashes: { q1: 'h' },
    reviewedQuestionIds: ['q1'],
    model: 'm',
    generatedAt: 1,
    updatedAt: 1,
    ...over,
  }) as QuizTranslation;

const fresh = { es: new Set(['q1']) };

describe('collectLocalizedFibAnswers', () => {
  it('snapshots a reviewed, fresh FIB answer per locale', () => {
    expect(
      collectLocalizedFibAnswers([fib()], { es: sidecar() }, fresh)
    ).toEqual({ q1: { es: ['París'] } });
  });

  it('skips an unreviewed entry', () => {
    expect(
      collectLocalizedFibAnswers(
        [fib()],
        { es: sidecar({ reviewedQuestionIds: [] }) },
        fresh
      )
    ).toEqual({});
  });

  it('skips a stale entry', () => {
    expect(
      collectLocalizedFibAnswers(
        [fib()],
        { es: sidecar() },
        {
          es: new Set<string>(),
        }
      )
    ).toEqual({});
  });

  it('ignores non-FIB questions', () => {
    const mc = { ...fib(), type: 'MC' } as QuizQuestion;
    expect(collectLocalizedFibAnswers([mc], { es: sidecar() }, fresh)).toEqual(
      {}
    );
  });
});

describe('fibAcceptedAnswers', () => {
  const map = { q1: { es: ['París'], so: ['Baariis', ' '] } };

  it('returns only the served locale, never every locale', () => {
    expect(fibAcceptedAnswers(map, 'q1', 'es')).toEqual(['París']);
    expect(fibAcceptedAnswers(map, 'q1', 'so')).toEqual(['Baariis']);
  });

  it('returns [] when no served locale is known', () => {
    expect(fibAcceptedAnswers(map, 'q1', undefined)).toEqual([]);
  });

  it('returns [] for an absent map, question or locale', () => {
    expect(fibAcceptedAnswers(undefined, 'q1', 'es')).toEqual([]);
    expect(fibAcceptedAnswers({}, 'q1', 'es')).toEqual([]);
    expect(fibAcceptedAnswers(map, 'q1', 'fr')).toEqual([]);
  });
});

describe('servedLocaleForResponse / fibAnswersForResponse', () => {
  const answers = { q1: { es: ['París'], so: ['Baariis'] } };
  const response = { studentUid: 'uid-1', locale: 'so' } as never;

  it('takes the locale from the teacher-side uid override', () => {
    expect(
      servedLocaleForResponse(response, {
        overridesByStudentUid: { 'uid-1': { language: 'es' } },
      })
    ).toBe('es');
  });

  it('ignores the client-asserted response locale', () => {
    expect(
      fibAnswersForResponse(
        { answers, overridesByStudentUid: { 'uid-1': { language: 'es' } } },
        response,
        'q1'
      )
    ).toEqual(['París']);
  });

  it('accepts English only when no override names a locale', () => {
    expect(fibAnswersForResponse({ answers }, response, 'q1')).toEqual([]);
  });

  it('falls back to the sourcedId override', () => {
    expect(
      fibAnswersForResponse(
        { answers, overridesBySourcedId: { 's-1': { language: 'so' } } },
        { studentUid: '', sourcedId: 's-1' } as never,
        'q1'
      )
    ).toEqual(['Baariis']);
  });
});

describe('collectLocalizedFibAnswers on normalizer output', () => {
  it('keeps the answer a round-tripped sidecar carries', () => {
    const roundTripped = normalizeQuizTranslation(
      JSON.parse(JSON.stringify(sidecar()))
    );
    expect(roundTripped.questions.q1.answer).toBe('París');
    expect(
      collectLocalizedFibAnswers([fib()], { es: roundTripped }, fresh)
    ).toEqual({ q1: { es: ['París'] } });
  });

  it('drops a locale whose translated stem lost a blank', () => {
    const broken = sidecar({
      questions: {
        q1: { text: 'La capital de Francia es París.', answer: 'París' },
      },
    });
    expect(collectLocalizedFibAnswers([fib()], { es: broken }, fresh)).toEqual(
      {}
    );
  });
});

describe('gradeAnswer — FIB accepted answers', () => {
  it('still grades the English answer correct', () => {
    expect(gradeAnswer(fib(), ' paris ', undefined, ['París']).isCorrect).toBe(
      true
    );
  });

  it('accepts a localized answer, normalized the same way', () => {
    expect(gradeAnswer(fib(), '  PARÍS ', undefined, ['París']).isCorrect).toBe(
      true
    );
  });

  it('still rejects a wrong answer', () => {
    expect(gradeAnswer(fib(), 'Lyon', undefined, ['París']).isCorrect).toBe(
      false
    );
  });

  it('is unchanged when no accepted answers are passed', () => {
    expect(gradeAnswer(fib(), 'París').isCorrect).toBe(false);
    expect(gradeAnswer(fib(), 'Paris').isCorrect).toBe(true);
  });

  it('does not widen MC grading', () => {
    const mc = {
      ...fib(),
      type: 'MC',
      incorrectAnswers: ['Lyon'],
    } as QuizQuestion;
    expect(gradeAnswer(mc, 'París', undefined, ['París']).isCorrect).toBe(
      false
    );
  });
});
