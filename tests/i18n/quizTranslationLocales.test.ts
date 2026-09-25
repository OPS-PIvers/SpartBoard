import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

// Dotted paths the quiz-translation surfaces call; §14 of the plan is the source.
const REQUIRED_KEYS = [
  'label',
  'editor.tab',
  'editor.pickLanguage',
  'editor.generate',
  'editor.reviewed',
  'editor.stale',
  'editor.regenerate_one',
  'editor.regenerate_other',
  'editor.servedCount',
  'editor.save',
  'editor.english',
  'editor.disabled.capReached',
  'editor.disabled.sourceNotEnglish',
  'editor.disabled.bankSlots',
  'editor.chromeNote',
  'editor.empty.noLanguage.title',
  'editor.empty.noLanguage.body',
  'editor.empty.noneReviewed.title',
  'editor.empty.noneReviewed.body',
  'editor.empty.pickQuestion.title',
  'editor.empty.pickQuestion.body',
  'authoring.advisory.stimulusText_one',
  'authoring.advisory.stimulusText_other',
  'assign.generate',
  'assign.advisory.missing_one',
  'assign.advisory.missing_other',
  'student.toggle.english',
  'grading.backTranslate',
  'grading.backTranslationLabel',
  'grading.machineGenerated',
] as const;

const locales = { en, de, es, fr } as const;

const lookup = (root: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (acc, part) =>
        typeof acc === 'object' && acc !== null
          ? (acc as Record<string, unknown>)[part]
          : undefined,
      root
    );

const group = (locale: unknown): unknown =>
  (locale as { quizTranslation?: unknown }).quizTranslation;

describe('quizTranslation locale keys', () => {
  for (const [name, locale] of Object.entries(locales)) {
    it(`${name} has every quizTranslation key, non-empty`, () => {
      const bundle = group(locale);
      expect(bundle, `${name}.quizTranslation missing`).toBeDefined();
      for (const key of REQUIRED_KEYS) {
        const value = lookup(bundle, key);
        expect(
          typeof value,
          `${name}.quizTranslation.${key} missing or not a string`
        ).toBe('string');
        expect(
          (value as string).trim().length,
          `${name}.quizTranslation.${key} empty`
        ).toBeGreaterThan(0);
      }
    });
  }

  it('keeps every interpolation placeholder in every locale', () => {
    for (const [name, locale] of Object.entries(locales)) {
      const bundle = group(locale);
      const served = lookup(bundle, 'editor.servedCount') as string;
      expect(served, name).toContain('{{reviewed}}');
      expect(served, name).toContain('{{total}}');
      for (const suffix of ['_one', '_other']) {
        const missing = lookup(
          bundle,
          `assign.advisory.missing${suffix}`
        ) as string;
        expect(missing, `${name}${suffix}`).toContain('{{name}}');
        expect(missing, `${name}${suffix}`).toContain('{{language}}');
        expect(
          lookup(bundle, `authoring.advisory.stimulusText${suffix}`) as string,
          `${name}${suffix}`
        ).toContain('{{count}}');
        expect(
          lookup(bundle, `editor.regenerate${suffix}`) as string,
          `${name}${suffix}`
        ).toContain('{{count}}');
      }
    }
  });

  it('uses _one/_other plural pairs, never "(s)"', () => {
    for (const [name, locale] of Object.entries(locales)) {
      const bundle = group(locale);
      for (const base of [
        'editor.regenerate',
        'authoring.advisory.stimulusText',
        'assign.advisory.missing',
      ]) {
        expect(lookup(bundle, `${base}_one`), `${name}.${base}`).toBeTruthy();
        expect(lookup(bundle, `${base}_other`), `${name}.${base}`).toBeTruthy();
        expect(lookup(bundle, base), `${name}.${base} singular form`).toBe(
          undefined
        );
      }
      expect(JSON.stringify(bundle), name).not.toContain('(s)');
    }
  });
});
