// Index counts live in the translatable subset, which since PR4 includes FIB:
// an untranslated FIB question keeps the locale uncovered until it is translated.

import { describe, it, expect } from 'vitest';
import type { QuizQuestion, QuizTranslation } from '@/types';
import {
  buildTranslationIndexEntry,
  recomputeTranslationIndex,
  staleQuestionIds,
} from './quizTranslationIndex';
import { hashQuestionForTranslation } from './quizTranslationHash';
import { isLocaleCovered } from './quizTranslationAdvisory';

const mc: QuizQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Which is prime?',
  correctAnswer: 'Seven',
  incorrectAnswers: ['Eight'],
  timeLimit: 0,
} as QuizQuestion;

const fib: QuizQuestion = {
  id: 'q2',
  type: 'FIB',
  text: 'The capital is ___.',
  correctAnswer: 'Paris',
  timeLimit: 0,
} as QuizQuestion;

const payload = (sourceHashes: Record<string, string>): QuizTranslation =>
  ({
    locale: 'es',
    title: 'Números',
    questions: { q1: { text: '¿Cuál es primo?' } },
    sourceHashes,
    reviewedQuestionIds: ['q1'],
    model: 'gemini-3.5-flash-lite',
    generatedAt: 1,
    updatedAt: 2,
  }) as QuizTranslation;

describe('quizTranslationIndex over the translatable subset', () => {
  it('reports a FIB question with no sidecar hash as stale', async () => {
    const stale = await staleQuestionIds([mc, fib], {
      q1: await hashQuestionForTranslation(mc),
    });
    expect(stale).toEqual(['q2']);
  });

  it('counts FIB in the denominator, so an MC-only translation is uncovered', async () => {
    const entry = await buildTranslationIndexEntry(
      'file-es',
      payload({ q1: await hashQuestionForTranslation(mc) }),
      [mc, fib]
    );
    expect(entry.questionCount).toBe(2);
    expect(entry.reviewedCount).toBe(1);
    expect(entry.staleCount).toBe(1);
    expect(isLocaleCovered('es', { index: { es: entry } })).toBe(false);
  });

  it('covers the locale once the FIB question is translated too', async () => {
    const full = {
      ...payload({
        q1: await hashQuestionForTranslation(mc),
        q2: await hashQuestionForTranslation(fib),
      }),
      questions: {
        q1: { text: '¿Cuál es primo?' },
        q2: { text: 'La capital es ___.', answer: 'París' },
      },
      reviewedQuestionIds: ['q1', 'q2'],
    } as QuizTranslation;
    const entry = await buildTranslationIndexEntry('file-es', full, [mc, fib]);
    expect(entry.questionCount).toBe(2);
    expect(entry.reviewedCount).toBe(2);
    expect(entry.staleCount).toBe(0);
    expect(isLocaleCovered('es', { index: { es: entry } })).toBe(true);
  });

  it('still reports a genuinely edited translatable question as stale', async () => {
    const entry = await buildTranslationIndexEntry(
      'file-es',
      payload({ q1: 'old-hash' }),
      [mc, fib]
    );
    expect(entry.staleCount).toBe(2);
    expect(isLocaleCovered('es', { index: { es: entry } })).toBe(false);
  });

  it('carries an existing index forward with the translatable questionCount', async () => {
    const next = await recomputeTranslationIndex(
      {
        es: {
          driveFileId: 'file-es',
          reviewedCount: 1,
          staleCount: 0,
          questionCount: 2,
          sourceHashes: { q1: await hashQuestionForTranslation(mc) },
          updatedAt: 1,
        },
      },
      [mc, fib]
    );
    expect(next?.es.questionCount).toBe(2);
    expect(next?.es.staleCount).toBe(1);
  });
});
