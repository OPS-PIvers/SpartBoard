import { describe, it, expect, vi, afterEach } from 'vitest';
import { slugify, slugOrFallback } from './slug';

describe('slug', () => {
  describe('slugify', () => {
    it('lowercases input', () => {
      expect(slugify('HELLO')).toBe('hello');
      expect(slugify('MixedCase')).toBe('mixedcase');
    });

    it('strips a single leading @ for email-style domains', () => {
      expect(slugify('@example.com')).toBe('example-com');
    });

    it('only strips one leading @', () => {
      expect(slugify('@@example')).toBe('example');
    });

    it('does not strip @ if not at the start', () => {
      expect(slugify('foo@bar')).toBe('foo-bar');
    });

    it('collapses runs of non-alphanumerics into a single dash', () => {
      expect(slugify('hello world')).toBe('hello-world');
      expect(slugify('hello   world')).toBe('hello-world');
      expect(slugify('hello___world')).toBe('hello-world');
      expect(slugify('hello!@#$%world')).toBe('hello-world');
    });

    it('preserves digits', () => {
      expect(slugify('abc123')).toBe('abc123');
      expect(slugify('123abc')).toBe('123abc');
    });

    it('trims leading and trailing dashes', () => {
      expect(slugify('---hello---')).toBe('hello');
      expect(slugify('!!!hello!!!')).toBe('hello');
    });

    it('caps length at 48 characters and trims trailing dashes after truncation', () => {
      const input = 'a'.repeat(100);
      expect(slugify(input)).toHaveLength(48);
      expect(slugify(input)).toBe('a'.repeat(48));
      expect(slugify('a'.repeat(47) + ' ' + 'b')).toBe('a'.repeat(47));
    });

    it('returns empty string when input has no alphanumerics', () => {
      expect(slugify('!!!')).toBe('');
      expect(slugify('   ')).toBe('');
      expect(slugify('¿¿¿')).toBe('');
      expect(slugify('')).toBe('');
    });

    it('returns empty string for input that becomes only dashes after normalization', () => {
      expect(slugify('---')).toBe('');
    });

    it('treats non-ASCII letters as separators (a-z0-9 only)', () => {
      // Accented characters fall outside [a-z0-9] so they become separators
      expect(slugify('café')).toBe('caf');
      expect(slugify('résumé')).toBe('r-sum');
    });

    it('handles realistic organization-style inputs', () => {
      expect(slugify('Acme Corporation')).toBe('acme-corporation');
      expect(slugify("O'Reilly & Sons, Inc.")).toBe('o-reilly-sons-inc');
      expect(slugify('@gmail.com')).toBe('gmail-com');
    });
  });

  describe('slugOrFallback', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns slugified input when it is non-empty', () => {
      expect(slugOrFallback('Hello World', 'fallback')).toBe('hello-world');
    });

    it('uses crypto.randomUUID when slug is empty and randomUUID is available', () => {
      const fakeUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(fakeUuid);

      const result = slugOrFallback('!!!', 'org');

      // Truncated to UUID_FALLBACK_LENGTH (24)
      // Should be truncated to 23 (stripping the trailing dash at index 23)
      expect(result).toBe(fakeUuid.slice(0, 23));
      expect(result).toHaveLength(23);
    });

    it('falls back to `${prefix}-${timestamp}` when crypto.randomUUID is unavailable', () => {
      const original = globalThis.crypto;
      // Strip randomUUID to force the timestamp branch
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: { ...original, randomUUID: undefined },
      });

      const fixedNow = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

      try {
        const result = slugOrFallback('???', 'org');
        // `org-1700000000000` is 17 chars — under the 24-char cap, so the slice
        // doesn't truncate.
        expect(result).toBe(`org-${fixedNow}`);
      } finally {
        Object.defineProperty(globalThis, 'crypto', {
          configurable: true,
          value: original,
        });
      }
    });

    it('truncates a long timestamp fallback to 24 characters', () => {
      const original = globalThis.crypto;
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: { ...original, randomUUID: undefined },
      });

      // Use a long prefix to force truncation
      const longPrefix = 'a-very-long-prefix-name-that-should-be-cut';
      vi.spyOn(Date, 'now').mockReturnValue(1234567890);

      try {
        const result = slugOrFallback('!!!', longPrefix);
        expect(result).toBe(
          `${longPrefix}-1234567890`.slice(0, 24).replace(/-+$/g, '')
        );
      } finally {
        Object.defineProperty(globalThis, 'crypto', {
          configurable: true,
          value: original,
        });
      }
    });

    it('does not call the fallback when the input slugifies cleanly', () => {
      const spy = vi.spyOn(globalThis.crypto, 'randomUUID');
      slugOrFallback('valid-input', 'unused');
      expect(spy).not.toHaveBeenCalled();
    });

    it('caps slugified result at 48 characters before considering fallback', () => {
      const input = 'a'.repeat(100);
      expect(slugOrFallback(input, 'org')).toBe('a'.repeat(48));
    });
  });
});
