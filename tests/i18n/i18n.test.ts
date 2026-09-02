import { describe, it, expect } from 'vitest';
import i18n, { SUPPORTED_LANGUAGES } from '@/i18n/index';

describe('i18n config', () => {
  it('should initialize with supported languages', () => {
    const expectedLangs = SUPPORTED_LANGUAGES.map((lang) => lang.code);
    expect(i18n.options.supportedLngs).toEqual(
      expect.arrayContaining(expectedLangs)
    );
    // Added cimode which is automatically added by i18next in tests/debug
    expect(i18n.options.supportedLngs).toHaveLength(expectedLangs.length + 1);
  });

  it('should default to english fallback', () => {
    expect(i18n.options.fallbackLng).toEqual(['en']);
  });

  it('should load resource bundles for all languages', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(i18n.hasResourceBundle(lang.code, 'translation')).toBe(true);
    }
  });
});

describe('quizMediaResponse plurals', () => {
  const PLURAL_KEYS = [
    'capture.takeLimitReachedBody',
    'capture.submitBlockedTitle',
    'capture.submitBlockedBody',
    'authoring.advisory.slots',
  ];

  function bundle(lang: string): Record<string, unknown> {
    return (
      i18n.getResourceBundle(lang, 'translation') as {
        quizMediaResponse: Record<string, unknown>;
      }
    ).quizMediaResponse;
  }

  function at(root: Record<string, unknown>, path: string): unknown {
    return path
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        root
      );
  }

  it.each(SUPPORTED_LANGUAGES.map((l) => l.code))(
    'carries _one/_other forms in %s',
    (lang) => {
      const ns = bundle(lang);
      for (const key of PLURAL_KEYS) {
        expect(typeof at(ns, `${key}_one`)).toBe('string');
        expect(typeof at(ns, `${key}_other`)).toBe('string');
        expect(at(ns, key)).toBeUndefined();
      }
    }
  );

  it.each(SUPPORTED_LANGUAGES.map((l) => l.code))(
    'hand-rolled "(s)" plurals are gone from %s',
    (lang) => {
      expect(JSON.stringify(bundle(lang))).not.toContain('(s)');
    }
  );

  it('resolves the take-limit sentence by count', () => {
    expect(
      i18n.t('quizMediaResponse.capture.takeLimitReachedBody', { count: 1 })
    ).toContain('1 take,');
    expect(
      i18n.t('quizMediaResponse.capture.takeLimitReachedBody', { count: 3 })
    ).toContain('3 takes,');
  });
});
