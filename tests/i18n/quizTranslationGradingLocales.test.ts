import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

// Keys BackTranslationPanel calls without a defaultValue.
const REQUIRED_KEYS = [
  'sectionLabel',
  'backTranslate',
  'backTranslating',
  'backTranslationLabel',
  'nativeLabel',
  'machineGenerated',
  'translatedRubricNote',
] as const;

const REQUIRED_ERROR_KEYS = ['failed', 'capReached'] as const;

const locales = { en, de, es, fr } as const;

type GradingBundle = Record<string, string> & {
  errors?: Record<string, string>;
};

const gradingOf = (locale: unknown): GradingBundle | undefined =>
  (locale as { quizTranslation?: { grading?: GradingBundle } }).quizTranslation
    ?.grading;

describe('quizTranslation.grading locale keys', () => {
  for (const [name, locale] of Object.entries(locales)) {
    it(`${name} has every quizTranslation.grading key`, () => {
      const grading = gradingOf(locale);
      expect(grading, `${name}.quizTranslation.grading missing`).toBeDefined();
      const present = grading ?? {};
      for (const key of REQUIRED_KEYS) {
        expect(
          present,
          `${name}.quizTranslation.grading.${key} missing`
        ).toHaveProperty(key);
        expect(String(present[key]).trim().length).toBeGreaterThan(0);
      }
      const errors = present.errors ?? {};
      for (const key of REQUIRED_ERROR_KEYS) {
        expect(
          errors,
          `${name}.quizTranslation.grading.errors.${key} missing`
        ).toHaveProperty(key);
        expect(String(errors[key]).trim().length).toBeGreaterThan(0);
      }
    });
  }

  it('translates the strings rather than copying English', () => {
    const english = gradingOf(en) as GradingBundle;
    for (const name of ['de', 'es', 'fr'] as const) {
      const grading = gradingOf(locales[name]) as GradingBundle;
      expect(grading.backTranslate, name).not.toBe(english.backTranslate);
    }
  });
});
