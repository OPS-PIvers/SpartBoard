// D21: every index count lives in the translatable subset, so a FIB question
// must never make a fully reviewed locale read as uncovered forever.

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
  it('never reports an untranslatable FIB question as stale', async () => {
    const stale = await staleQuestionIds([mc, fib], {
      q1: await hashQuestionForTranslation(mc),
    });
    expect(stale).toEqual([]);
  });

  it('counts only translatable questions, so a reviewed MC covers the locale', async () => {
    const entry = await buildTranslationIndexEntry(
      'file-es',
      payload({ q1: await hashQuestionForTranslation(mc) }),
      [mc, fib]
    );
    expect(entry.questionCount).toBe(1);
    expect(entry.reviewedCount).toBe(1);
    expect(entry.staleCount).toBe(0);
    expect(isLocaleCovered('es', { index: { es: entry } })).toBe(true);
  });

  it('still reports a genuinely edited translatable question as stale', async () => {
    const entry = await buildTranslationIndexEntry(
      'file-es',
      payload({ q1: 'old-hash' }),
      [mc, fib]
    );
    expect(entry.staleCount).toBe(1);
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
    expect(next?.es.questionCount).toBe(1);
    expect(next?.es.staleCount).toBe(0);
  });
});
