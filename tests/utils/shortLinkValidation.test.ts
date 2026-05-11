// Unit coverage for the short-link validation helpers. These pure
// functions back security-sensitive surfaces (the public /r/:code
// resolver hands the validated destination straight to
// window.location.replace, and the slug list shadows real SPA routes),
// so the rules they enforce — scheme allowlist, reserved-slug
// rejection, length bounds, and the "result is exactly `length`
// characters" contract of `generateRandomCode` — are worth asserting
// directly.

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_DESTINATION_LENGTH,
  MAX_SLUG_LENGTH,
  MIN_SLUG_LENGTH,
  RANDOM_CODE_LENGTH,
  RESERVED_SLUGS,
  generateRandomCode,
  validateDestination,
  validateSlug,
} from '@/utils/shortLinkValidation';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('validateSlug', () => {
  it('rejects an empty or whitespace-only slug', () => {
    expect(validateSlug('')).toEqual({
      ok: false,
      reason: expect.stringContaining('empty'),
    });
    expect(validateSlug('   ')).toEqual({
      ok: false,
      reason: expect.stringContaining('empty'),
    });
  });

  it('rejects a slug that normalizes to no alphanumerics', () => {
    const result = validateSlug('!!! ??? ###');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/letter or number/i);
    }
  });

  it('normalizes mixed-case and punctuation into the canonical form', () => {
    const result = validateSlug('Hello World!');
    expect(result).toEqual({ ok: true, slug: 'hello-world' });
  });

  it(`rejects slugs shorter than ${MIN_SLUG_LENGTH} characters`, () => {
    // `MIN_SLUG_LENGTH` is 2; a single character is invalid.
    const result = validateSlug('a');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/at least/i);
    }
  });

  it(`rejects slugs longer than ${MAX_SLUG_LENGTH} characters`, () => {
    const tooLong = 'a'.repeat(MAX_SLUG_LENGTH + 1);
    const result = validateSlug(tooLong);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/at most/i);
    }
  });

  it('rejects every reserved slug', () => {
    // The security guarantee is "no reserved slug ever passes
    // validation" — not which error message wins. (e.g. `'r'` is only 1
    // character, so the length check fires before the reserved-list
    // check.) Assert the broader invariant.
    for (const reserved of RESERVED_SLUGS) {
      const result = validateSlug(reserved);
      expect(result.ok, `expected "${reserved}" to be rejected`).toBe(false);
    }
  });

  it('flags multi-char reserved slugs with the reserved reason specifically', () => {
    // Pick a reserved slug that comfortably clears the length check so we
    // can assert the reserved-list message itself fires.
    const result = validateSlug('admin');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/reserved/i);
    }
  });

  it('rejects a reserved slug even when input casing differs', () => {
    const result = validateSlug('ADMIN');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/reserved/i);
    }
  });
});

describe('validateDestination', () => {
  it('rejects empty input', () => {
    expect(validateDestination('   ')).toEqual({
      ok: false,
      reason: expect.stringContaining('required'),
    });
  });

  it('rejects URLs exceeding the length cap before parsing', () => {
    // The cap check fires before URL parsing so an absurdly long string
    // still produces a deterministic "too long" message instead of an
    // opaque parse failure.
    const tooLong = `https://example.com/${'a'.repeat(MAX_DESTINATION_LENGTH)}`;
    const result = validateDestination(tooLong);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/too long/i);
    }
  });

  it('rejects strings that are not parseable as URLs', () => {
    const result = validateDestination('not a url');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/complete URL/i);
    }
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['file:///etc/passwd'],
    ['ftp://example.com/'],
  ])('rejects non-http(s) scheme: %s', (raw) => {
    const result = validateDestination(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/http/i);
    }
  });

  it('accepts http URLs', () => {
    const result = validateDestination('http://example.com/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.startsWith('http://example.com/')).toBe(true);
    }
  });

  it('accepts https URLs and returns the normalized form', () => {
    const result = validateDestination('HTTPS://Example.com/Foo?b=1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // `new URL().toString()` lowercases the host but preserves the
      // path/query; assert on the resulting shape rather than a literal
      // to keep the test robust against trailing-slash quirks.
      expect(result.url).toMatch(/^https:\/\/example\.com\/Foo\?b=1$/);
    }
  });
});

describe('generateRandomCode', () => {
  it('returns the default length when called with no arguments', () => {
    expect(generateRandomCode()).toHaveLength(RANDOM_CODE_LENGTH);
  });

  it('returns exactly the requested length for short codes', () => {
    for (const length of [2, 4, 8, 16, 32]) {
      expect(generateRandomCode(length)).toHaveLength(length);
    }
  });

  it('returns exactly the requested length when length > 32 (UUID hex cap)', () => {
    // Regression for the silent under-return bug: the UUID branch is
    // only 32 hex chars, so any `length > 32` must fall through to the
    // getRandomValues path which can produce arbitrary widths.
    expect(generateRandomCode(33)).toHaveLength(33);
    expect(generateRandomCode(64)).toHaveLength(64);
  });

  it('produces lowercase hex output', () => {
    const code = generateRandomCode(16);
    expect(code).toMatch(/^[0-9a-f]+$/);
  });

  it('uses getRandomValues when randomUUID is missing', () => {
    // Stub a crypto-like object exposing only getRandomValues. The
    // function must still honor the contract — no falling back to
    // Math.random — for callers in environments without
    // `crypto.randomUUID` (some older WebViews).
    const getRandomValues = vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = i;
      return arr;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    const code = generateRandomCode(8);
    expect(code).toHaveLength(8);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it('throws when no secure random source is available', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => generateRandomCode(8)).toThrow(/secure random/i);
  });
});
