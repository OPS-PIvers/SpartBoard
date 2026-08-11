/**
 * Tests for `normalizeModelName` — the single validation gate every
 * Firestore-supplied Gemini model override passes through
 * (`getGeminiModelConfig` in aiGeneration.ts).
 *
 * Raised in review on #2395: the function validated only against
 * `/^gemini-[\w.-]+$/`, which still matches the `*-preview` 3.x IDs and the
 * 2.0/1.5 models that GEMINI.md marks deprecated and must-not-be-used. Any
 * org/building with one of those saved in `global_permissions/gemini-functions`
 * kept using it unchanged after the Vertex migration, silently bypassing the
 * new defaults — and the audit doc scoped the remedy to a one-time manual
 * Firestore sweep rather than anything in code.
 *
 * Rejecting deprecated ids here makes the function return `undefined`, which
 * every caller already treats as "use the default", so a stale override
 * self-heals on the next call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeModelName } from './shared';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeModelName — accepted values', () => {
  it('accepts the current defaults', () => {
    expect(normalizeModelName('gemini-3.6-flash')).toBe('gemini-3.6-flash');
    expect(normalizeModelName('gemini-3.5-flash-lite')).toBe(
      'gemini-3.5-flash-lite'
    );
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeModelName('  gemini-3.6-flash  ')).toBe('gemini-3.6-flash');
  });

  it('stays permissive for unknown future model ids (no deploy needed)', () => {
    // The permissive pattern is deliberate — a new model must not require a
    // functions deploy to become selectable.
    expect(normalizeModelName('gemini-4.0-ultra')).toBe('gemini-4.0-ultra');
  });

  it('does not reject the 2.5 models (not named deprecated in GEMINI.md)', () => {
    // Deliberately narrower than "anything below 3.x": GEMINI.md names only
    // 1.5/2.0 and the *-preview ids. Widening this is a product decision.
    expect(normalizeModelName('gemini-2.5-flash')).toBe('gemini-2.5-flash');
  });
});

describe('normalizeModelName — rejected values', () => {
  it.each([
    ['gemini-1.5-flash'],
    ['gemini-1.5-pro'],
    ['gemini-2.0-flash'],
    ['gemini-2.0-flash-lite'],
  ])('rejects the deprecated model %s', (model) => {
    expect(normalizeModelName(model)).toBeUndefined();
  });

  it.each([['gemini-3-flash-preview'], ['gemini-3.1-flash-lite-preview']])(
    'rejects the superseded preview id %s',
    (model) => {
      // Matched by suffix rather than an explicit list — preview ids are minted
      // and retired continuously.
      expect(normalizeModelName(model)).toBeUndefined();
    }
  );

  it('warns when discarding a deprecated override so the fallback is traceable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    normalizeModelName('gemini-2.0-flash');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('gemini-2.0-flash')
    );
  });

  it('still rejects malformed and non-string values', () => {
    expect(normalizeModelName('')).toBeUndefined();
    expect(normalizeModelName('   ')).toBeUndefined();
    expect(normalizeModelName('gpt-4')).toBeUndefined();
    expect(normalizeModelName('gemini')).toBeUndefined();
    expect(normalizeModelName(undefined)).toBeUndefined();
    expect(normalizeModelName(null)).toBeUndefined();
    expect(normalizeModelName(42)).toBeUndefined();
    expect(normalizeModelName({ model: 'gemini-3.6-flash' })).toBeUndefined();
  });
});
