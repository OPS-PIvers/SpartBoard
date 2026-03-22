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
