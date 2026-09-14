import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  QuizPublicQuestion,
  QuizQuestion,
  QuizTranslation,
  QuizTranslationIndexEntry,
} from '@/types';
import { hashQuestionForTranslation } from './quizTranslationHash';
import {
  enforceSessionSizeBudget,
  loadTranslationsForPublish,
  targetedLocaleCounts,
} from './quizTranslationPublish';

const question: QuizQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Capital of France?',
  timeLimit: 0,
  correctAnswer: 'Paris',
  incorrectAnswers: ['London'],
};

const index = (codes: string[]): Record<string, QuizTranslationIndexEntry> =>
  Object.fromEntries(
    codes.map((code) => [
      code,
      {
        driveFileId: `file-${code}`,
        reviewedCount: 1,
        staleCount: 0,
        questionCount: 1,
        sourceHashes: {},
        updatedAt: 1,
      },
    ])
  );

function sidecar(hash: string): Promise<QuizTranslation> {
  return Promise.resolve({
    locale: 'es',
    title: 'Examen',
    questions: { q1: { text: '¿Capital de Francia?' } },
    sourceHashes: { q1: hash },
    reviewedQuestionIds: ['q1'],
    model: 'test',
    generatedAt: 1,
    updatedAt: 1,
  });
}

/** A loader that never settles, standing in for a stalled Drive GET. */
const neverSettles = (): void => undefined;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('targetedLocaleCounts', () => {
  it('counts the union of override languages', () => {
    expect(
      targetedLocaleCounts({
        a: { language: 'es' },
        b: { language: 'so' },
        c: { language: 'es' },
        d: {},
      })
    ).toEqual({ es: 2, so: 1 });
  });
});

describe('loadTranslationsForPublish', () => {
  it('marks questions fresh only when the recorded hash still matches', async () => {
    const hash = await hashQuestionForTranslation(question);
    const result = await loadTranslationsForPublish(
      { loadTranslation: () => sidecar(hash) },
      index(['es']),
      ['es'],
      [question]
    );
    expect(result.freshQuestionIdsByLocale.es.has('q1')).toBe(true);
    expect(result.titleByLocale.es).toBe('Examen');
  });

  it('treats an edited question as stale', async () => {
    const result = await loadTranslationsForPublish(
      { loadTranslation: () => sidecar('stale-hash') },
      index(['es']),
      ['es'],
      [question]
    );
    expect(result.freshQuestionIdsByLocale.es.has('q1')).toBe(false);
  });

  it('drops a locale whose sidecar fails and keeps the others', async () => {
    const hash = await hashQuestionForTranslation(question);
    const result = await loadTranslationsForPublish(
      {
        loadTranslation: (fileId: string) =>
          fileId === 'file-so'
            ? Promise.reject(new Error('429'))
            : sidecar(hash),
      },
      index(['es', 'so']),
      ['es', 'so'],
      [question]
    );
    expect(Object.keys(result.byLocale)).toEqual(['es']);
  });

  it('drops a locale whose sidecar never resolves, without blocking', async () => {
    const result = await loadTranslationsForPublish(
      { loadTranslation: () => new Promise<QuizTranslation>(neverSettles) },
      index(['es']),
      ['es'],
      [question],
      5
    );
    expect(result.byLocale).toEqual({});
    expect(result.titleByLocale).toEqual({});
  });

  it('withholds the localized title when nothing reviewed is fresh', async () => {
    const result = await loadTranslationsForPublish(
      { loadTranslation: () => sidecar('stale-hash') },
      index(['es']),
      ['es'],
      [question]
    );
    expect(result.titleByLocale.es).toBeUndefined();
  });

  it('marks a FIB question fresh when its hash matches (PR4)', async () => {
    const fib: QuizQuestion = {
      id: 'q1',
      type: 'FIB',
      text: 'The capital of France is ___.',
      timeLimit: 0,
      correctAnswer: 'Paris',
      incorrectAnswers: [],
    };
    const hash = await hashQuestionForTranslation(fib);
    const result = await loadTranslationsForPublish(
      { loadTranslation: () => sidecar(hash) },
      index(['es']),
      ['es'],
      [fib]
    );
    expect(result.freshQuestionIdsByLocale.es.has('q1')).toBe(true);
  });

  it('is a no-op without a Drive handle', async () => {
    const result = await loadTranslationsForPublish(
      null,
      index(['es']),
      ['es'],
      [question]
    );
    expect(result.byLocale).toEqual({});
  });
});

describe('enforceSessionSizeBudget', () => {
  const build = () => {
    const publicQuestions: QuizPublicQuestion[] = Array.from(
      { length: 20 },
      (_, i) => ({
        id: `q${i}`,
        type: 'MC',
        text: 'x'.repeat(200),
        timeLimit: 0,
        choices: ['a', 'b', 'c', 'd'],
        localized: {
          es: { text: 'e'.repeat(400) },
          so: { text: 's'.repeat(400) },
        },
      })
    );
    return {
      publicQuestions,
      quizTitleLocalized: { es: 'Examen', so: 'Imtixaan' },
    };
  };

  it('drops nothing when the session already fits', () => {
    const session = build();
    expect(enforceSessionSizeBudget(session, { es: 2, so: 1 })).toEqual([]);
    expect(session.publicQuestions[0].localized).toHaveProperty('so');
  });

  it('drops the least-targeted locale first, keeping the rest', () => {
    // Budget = exactly the size the session reaches once `so` is gone, so the
    // loop must stop after one drop.
    const probe = build();
    enforceSessionSizeBudget(probe, { so: 1 }, 0);
    const budget = new TextEncoder().encode(JSON.stringify(probe)).length;

    const session = build();
    const dropped = enforceSessionSizeBudget(session, { es: 9, so: 1 }, budget);
    expect(dropped).toEqual(['so']);
    expect(session.publicQuestions[0].localized).toHaveProperty('es');
    expect(session.publicQuestions[0].localized).not.toHaveProperty('so');
    expect(session.quizTitleLocalized).not.toHaveProperty('so');
  });

  it('returns with every locale dropped when it still cannot fit', () => {
    const session = build();
    const dropped = enforceSessionSizeBudget(session, { es: 9, so: 1 }, 1);
    expect(dropped).toEqual(['so', 'es']);
    expect(session.publicQuestions[0].localized).toBeUndefined();
    expect(session.quizTitleLocalized).toBeUndefined();
  });

  it('never reports a locale the session was not carrying', () => {
    const session = build();
    expect(enforceSessionSizeBudget(session, { hmn: 5 }, 1)).toEqual([]);
  });

  it('removes the localized key entirely once the last locale goes', () => {
    const session = build();
    enforceSessionSizeBudget(session, { es: 9, so: 1 }, 10);
    expect(session.publicQuestions[0].localized).toBeUndefined();
    expect(session.quizTitleLocalized).toBeUndefined();
  });
});
