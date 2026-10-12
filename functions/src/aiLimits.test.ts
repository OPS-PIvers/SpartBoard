import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_INPUT_CHARS,
  MAX_INPUT_CHARS,
  MAX_OUTPUT_TOKENS,
  MIN_INPUT_CHARS,
  maxInputCharsFor,
  parseIntegrationLimits,
} from './aiLimits';

describe('parseIntegrationLimits', () => {
  it('keeps numeric limits for known integrations and clamps them', () => {
    expect(
      parseIntegrationLimits({
        'mini-app': { maxInputChars: 300_000.4, maxOutputTokens: 999_999 },
        poll: { maxInputChars: 5 },
        nope: { maxInputChars: 20_000 },
        quiz: { maxInputChars: '20000', maxOutputTokens: null },
      })
    ).toEqual({
      'mini-app': {
        maxInputChars: 300_000,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
      poll: { maxInputChars: MIN_INPUT_CHARS },
    });
  });

  it('ignores a missing or malformed value', () => {
    expect(parseIntegrationLimits(undefined)).toEqual({});
    expect(parseIntegrationLimits('x')).toEqual({});
    expect(
      parseIntegrationLimits({ quiz: { maxInputChars: Infinity } })
    ).toEqual({});
  });
});

describe('maxInputCharsFor', () => {
  it('uses the saved limit, then the integration default, then the general one', () => {
    expect(maxInputCharsFor('quiz', { quiz: { maxInputChars: 80_000 } })).toBe(
      80_000
    );
    expect(maxInputCharsFor('mini-app', {})).toBe(200_000);
    expect(maxInputCharsFor('poll', {})).toBe(DEFAULT_MAX_INPUT_CHARS);
    expect(MAX_INPUT_CHARS).toBeGreaterThan(200_000);
  });
});
