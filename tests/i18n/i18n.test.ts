import { describe, it, expect } from 'vitest';
import i18n, { SUPPORTED_LANGUAGES } from '@/i18n/index';

describe('i18n config', () => {
  it('should initialize with supported languages', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(4);
    expect(i18n.options.supportedLngs).toContain('en');
    expect(i18n.options.supportedLngs).toContain('es');
    expect(i18n.options.supportedLngs).toContain('de');
    expect(i18n.options.supportedLngs).toContain('fr');
  });

  it('should default to english fallback', () => {
    expect(i18n.options.fallbackLng).toEqual(['en']);
  });

  it('should load resource bundles for all languages', () => {
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('es', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('de', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('fr', 'translation')).toBe(true);
  });
});
