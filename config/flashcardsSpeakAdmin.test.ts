import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLASHCARDS_SPEAK_ADMIN_CONFIG,
  DEFAULT_SPEAK_ATTEMPTS,
  DEFAULT_UNCLEAR_CONFIDENCE,
  clampSpeakAttempts,
  normalizeFlashcardsSpeakAdminConfig,
} from './flashcardsSpeakAdmin';

describe('normalizeFlashcardsSpeakAdminConfig', () => {
  it.each([undefined, null, 'x', 4, [], {}])(
    'returns the defaults for %j',
    (raw) => {
      expect(normalizeFlashcardsSpeakAdminConfig(raw)).toEqual(
        DEFAULT_FLASHCARDS_SPEAK_ADMIN_CONFIG
      );
    }
  );

  it('gives every language a preset and no overrides by default', () => {
    expect(DEFAULT_FLASHCARDS_SPEAK_ADMIN_CONFIG.languages).toEqual({
      es: { preset: 'beginner', groups: {} },
      de: { preset: 'beginner', groups: {} },
      en: { preset: 'beginner', groups: {} },
    });
  });

  it('keeps valid values', () => {
    const config = normalizeFlashcardsSpeakAdminConfig({
      languages: {
        es: {
          preset: 'advanced',
          groups: { 'es-trill': 'require', stress: 'forgive' },
        },
        de: { preset: 'intermediate' },
      },
      attempts: 5,
      unclearConfidence: 0.25,
    });
    expect(config.languages.es).toEqual({
      preset: 'advanced',
      groups: { 'es-trill': 'require', stress: 'forgive' },
    });
    expect(config.languages.de).toEqual({ preset: 'intermediate', groups: {} });
    expect(config.languages.en).toEqual({ preset: 'beginner', groups: {} });
    expect(config.attempts).toBe(5);
    expect(config.unclearConfidence).toBe(0.25);
  });

  it('drops a custom preset, unknown languages, other languages’ groups and bad settings', () => {
    const config = normalizeFlashcardsSpeakAdminConfig({
      languages: {
        es: {
          preset: 'custom',
          groups: {
            'de-r': 'forgive',
            'es-tap': 'sometimes',
            'es-jota': 'follow',
            nope: 'forgive',
          },
        },
        fr: { preset: 'advanced', groups: {} },
      },
    });
    expect(config.languages.es).toEqual({
      preset: 'beginner',
      groups: { 'es-jota': 'follow' },
    });
    expect(Object.keys(config.languages).sort()).toEqual(['de', 'en', 'es']);
  });

  it.each([
    [Number.NaN, DEFAULT_UNCLEAR_CONFIDENCE],
    [-0.1, DEFAULT_UNCLEAR_CONFIDENCE],
    [1.5, DEFAULT_UNCLEAR_CONFIDENCE],
    ['0.3', DEFAULT_UNCLEAR_CONFIDENCE],
    [0, 0],
    [1, 1],
  ])('unclearConfidence %j → %j', (raw, expected) => {
    expect(
      normalizeFlashcardsSpeakAdminConfig({ unclearConfidence: raw })
        .unclearConfidence
    ).toBe(expected);
  });
});

describe('clampSpeakAttempts', () => {
  it.each([
    [3, 3],
    [0, 1],
    [-4, 1],
    [11, 10],
    [2.6, 3],
    [Number.POSITIVE_INFINITY, DEFAULT_SPEAK_ATTEMPTS],
    ['5', DEFAULT_SPEAK_ATTEMPTS],
    [undefined, DEFAULT_SPEAK_ATTEMPTS],
  ])('%j → %j', (raw, expected) => {
    expect(clampSpeakAttempts(raw)).toBe(expected);
  });
});
