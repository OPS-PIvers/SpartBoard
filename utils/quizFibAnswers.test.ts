// PR4: the assign-time FIB answer-key snapshot and the grader's accepted list.

import { describe, it, expect } from 'vitest';
import type { QuizQuestion, QuizTranslation } from '@/types';
import {
  collectLocalizedFibAnswers,
  fibAcceptedAnswers,
} from './quizFibAnswers';
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
  it('flattens every locale and drops blanks', () => {
    expect(
      fibAcceptedAnswers({ q1: { es: ['París'], so: ['', ' '] } }, 'q1')
    ).toEqual(['París']);
  });

  it('returns [] for an absent map or question', () => {
    expect(fibAcceptedAnswers(undefined, 'q1')).toEqual([]);
    expect(fibAcceptedAnswers({}, 'q1')).toEqual([]);
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
