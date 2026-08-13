import { describe, it, expect } from 'vitest';
import { isDeprecatedGeminiModelId } from '@/utils/geminiModelDeprecation';

// Mirrors functions/src/normalizeModelName.test.ts — divergence means the admin panel contradicts the server.
describe('isDeprecatedGeminiModelId', () => {
  it.each([
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro-002',
    'gemini-1.0-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.0-pro',
    'gemini-2.0-flash-thinking-exp',
  ])('flags the retired model %s', (model) => {
    expect(isDeprecatedGeminiModelId(model)).toBe(true);
  });

  it.each([
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-3.0-flash-preview-06-05',
    'gemini-3.0-pro-preview-11-2025',
  ])('flags the superseded preview id %s', (model) => {
    expect(isDeprecatedGeminiModelId(model)).toBe(true);
  });

  it.each([
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ])('leaves the current and un-named models alone: %s', (model) => {
    expect(isDeprecatedGeminiModelId(model)).toBe(false);
  });

  it('does not let the 1.x prefix swallow future double-digit generations', () => {
    expect(isDeprecatedGeminiModelId('gemini-12.0-flash')).toBe(false);
  });

  it('does not treat "preview" inside a longer segment as deprecated', () => {
    expect(isDeprecatedGeminiModelId('gemini-4.0-previewer')).toBe(false);
  });
});
