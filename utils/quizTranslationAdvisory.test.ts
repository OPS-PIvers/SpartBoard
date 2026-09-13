import { describe, it, expect } from 'vitest';
import type { QuizTranslationIndexEntry } from '@/types';
import {
  isLocaleCovered,
  isNonEnglishQuizSource,
  newlyRequestedLocales,
  uncoveredLocalesForTargets,
} from './quizTranslationAdvisory';

const entry = (
  patch: Partial<QuizTranslationIndexEntry> = {}
): QuizTranslationIndexEntry => ({
  driveFileId: 'file-1',
  reviewedCount: 4,
  staleCount: 0,
  questionCount: 4,
  sourceHashes: {},
  updatedAt: 1,
  ...patch,
});

describe('isLocaleCovered', () => {
  it('is covered when every question is reviewed and fresh', () => {
    expect(isLocaleCovered('es', { index: { es: entry() } })).toBe(true);
  });

  it('is uncovered when a reviewed question went stale', () => {
    expect(
      isLocaleCovered('es', { index: { es: entry({ staleCount: 1 }) } })
    ).toBe(false);
  });

  it('is uncovered when some questions are unreviewed', () => {
    expect(
      isLocaleCovered('es', { index: { es: entry({ reviewedCount: 2 }) } })
    ).toBe(false);
  });

  it('treats a bank-slot quiz as untranslated regardless of the index (D29)', () => {
    expect(
      isLocaleCovered('es', { index: { es: entry() }, hasBankSlots: true })
    ).toBe(false);
  });

  it('is uncovered when the locale has no index row at all', () => {
    expect(isLocaleCovered('so', { index: { es: entry() } })).toBe(false);
  });
});

describe('uncoveredLocalesForTargets', () => {
  it('groups targeted students by the language the quiz cannot serve', () => {
    const result = uncoveredLocalesForTargets(
      [
        { name: 'Ana', language: 'es' },
        { name: 'Bilan', language: 'so' },
        { name: 'Cy', language: 'so' },
        { name: 'Dee' },
      ],
      { index: { es: entry() } }
    );
    expect(result).toEqual([{ locale: 'so', names: ['Bilan', 'Cy'] }]);
  });

  it('is empty when nobody targeted asks for a language', () => {
    expect(uncoveredLocalesForTargets([{ name: 'Dee' }], {})).toEqual([]);
  });
});

describe('isNonEnglishQuizSource', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['en', false],
    ['en-US', false],
    ['es', true],
  ])('%s -> %s', (language, expected) => {
    expect(isNonEnglishQuizSource(language)).toBe(expected);
  });
});

describe('newlyRequestedLocales', () => {
  it('flags a language this edit introduces', () => {
    expect(
      newlyRequestedLocales(
        { a: { language: 'es' } },
        { a: { language: 'es' }, b: { language: 'so' } },
        { b: 'Bilan' }
      )
    ).toEqual([{ locale: 'so', names: ['Bilan'] }]);
  });

  it('stays silent when the language was already published', () => {
    expect(
      newlyRequestedLocales(
        { a: { language: 'es' } },
        { a: { language: 'es' }, b: { language: 'es' } }
      )
    ).toEqual([]);
  });
});
