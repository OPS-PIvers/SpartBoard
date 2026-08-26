// Regression coverage for normalizeModelName() rejecting deprecated model ids — see PR #2395 review. A rejected id returns undefined, which every caller already treats as "use the default", so a stale override self-heals.
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
    expect(normalizeModelName('gemini-3.7-flash')).toBe('gemini-3.7-flash');
    expect(normalizeModelName('gemini-3.5-flash-lite')).toBe(
      'gemini-3.5-flash-lite'
    );
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeModelName('  gemini-3.7-flash  ')).toBe('gemini-3.7-flash');
  });

  it('stays permissive for unknown future model ids (no deploy needed)', () => {
    // The permissive pattern is deliberate — a new model must not require a
    // functions deploy to become selectable.
    expect(normalizeModelName('gemini-4.0-ultra')).toBe('gemini-4.0-ultra');
  });

  it('does not let the 1.x prefix swallow future double-digit generations', () => {
    // The trailing dot in `gemini-1.` is load-bearing: without it a future
    // `gemini-12.x` id would be rejected as if it were Gemini 1.
    expect(normalizeModelName('gemini-12.0-flash')).toBe('gemini-12.0-flash');
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
    // Matched by family prefix, not an exact list — GEMINI.md's "e.g." names
    // representatives of the 1.x/2.0 generations, not an exhaustive pair.
    ['gemini-1.5-flash-8b'],
    ['gemini-1.5-pro-002'],
    ['gemini-1.0-pro'],
    ['gemini-2.0-pro'],
    ['gemini-2.0-flash-thinking-exp'],
  ])('rejects the deprecated model %s', (model) => {
    expect(normalizeModelName(model)).toBeUndefined();
  });

  it.each([
    ['gemini-3-flash-preview'],
    ['gemini-3.1-flash-lite-preview'],
    // Date-versioned variants carry a trailing date segment rather than
    // ending at `-preview`, so a `$`-anchored suffix test would miss them.
    ['gemini-3.0-flash-preview-06-05'],
    ['gemini-3.0-pro-preview-11-2025'],
  ])('rejects the superseded preview id %s', (model) => {
    // Matched by pattern rather than an explicit list — preview ids are minted
    // and retired continuously.
    expect(normalizeModelName(model)).toBeUndefined();
  });

  it('does not treat "preview" inside a non-preview segment as deprecated', () => {
    // The pattern requires `-preview` to be a whole segment, so a future model
    // whose name merely contains the substring is not swept up.
    expect(normalizeModelName('gemini-4.0-previewer')).toBe(
      'gemini-4.0-previewer'
    );
  });

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
    expect(normalizeModelName({ model: 'gemini-3.7-flash' })).toBeUndefined();
  });
});
