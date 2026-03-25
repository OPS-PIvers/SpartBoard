import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getRandomInt,
  shuffleArray,
  generateSecureSessionCode,
} from '@/utils/randomHelpers';

describe('randomHelpers', () => {
  const originalCrypto = globalThis.crypto;
  const originalMathRandom = Math.random;

  beforeEach(() => {
    // Reset vi mocks
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore original globals safely
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
    Math.random = originalMathRandom;
  });

  describe('getRandomInt', () => {
    it('throws an error if max <= 0', () => {
      expect(() => getRandomInt(0)).toThrow('max must be greater than 0');
      expect(() => getRandomInt(-5)).toThrow('max must be greater than 0');
    });

    it('returns a number between 0 and max (exclusive) using crypto API', () => {
      const mockGetRandomValues = vi
        .fn()
        .mockImplementation((array: Uint32Array) => {
          array[0] = 42; // arbitrary number
          return array;
        });

      // Mock globalThis.crypto
      Object.defineProperty(globalThis, 'crypto', {
        value: {
          getRandomValues: mockGetRandomValues,
        },
        configurable: true,
      });

      const max = 100;
      const result = getRandomInt(max);
      expect(result).toBe(42 % 100);
      expect(mockGetRandomValues).toHaveBeenCalled();
    });

    it('falls back to Math.random() if crypto API is not available', () => {
      // Remove crypto from globalThis
      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        configurable: true,
      });

      const mockMathRandom = vi.fn().mockReturnValue(0.5);
      Math.random = mockMathRandom;

      const max = 10;
      const result = getRandomInt(max);

      // Math.floor(0.5 * 10) === 5
      expect(result).toBe(5);
      expect(mockMathRandom).toHaveBeenCalled();
    });

    it('handles rejection sampling correctly', () => {
      const max = 100;
      const UINT32_MAX = 0xffffffff;
      const limit = Math.floor((UINT32_MAX + 1) / max) * max - 1;

      // First call returns a value > limit (forcing rejection)
      // Second call returns a valid value <= limit
      const mockGetRandomValues = vi
        .fn()
        .mockImplementationOnce((array: Uint32Array) => {
          array[0] = limit + 1;
          return array;
        })
        .mockImplementationOnce((array: Uint32Array) => {
          array[0] = 42;
          return array;
        });

      Object.defineProperty(globalThis, 'crypto', {
        value: {
          getRandomValues: mockGetRandomValues,
        },
        configurable: true,
      });

      const result = getRandomInt(max);

      expect(mockGetRandomValues).toHaveBeenCalledTimes(2);
      expect(result).toBe(42 % max);
    });
  });

  describe('shuffleArray', () => {
    it('returns a new array with the same elements', () => {
      const original = [1, 2, 3, 4, 5];
      const result = shuffleArray(original);

      expect(result).not.toBe(original);
      expect(result.length).toBe(original.length);
      expect([...result].sort()).toEqual([...original].sort());
    });

    it('handles an empty array', () => {
      const original: number[] = [];
      const result = shuffleArray(original);

      expect(result).toEqual([]);
      expect(result).not.toBe(original);
    });

    it('handles a single-element array', () => {
      const original = [42];
      const result = shuffleArray(original);

      expect(result).toEqual([42]);
      expect(result).not.toBe(original);
    });
  });

  describe('generateSecureSessionCode', () => {
    it('returns a 6-character uppercase string using crypto.randomUUID', () => {
      const mockRandomUUID = vi
        .fn()
        .mockReturnValue('12345678-abcd-efgh-ijkl-mnopqrstuvwx');

      Object.defineProperty(globalThis, 'crypto', {
        value: {
          randomUUID: mockRandomUUID,
        },
        configurable: true,
      });

      const result = generateSecureSessionCode();

      expect(mockRandomUUID).toHaveBeenCalled();
      expect(result).toBe('123456'); // substring(0, 6) and uppercase
      expect(result.length).toBe(6);
    });

    it('falls back to Math.random() strategy if crypto.randomUUID is not available', () => {
      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        configurable: true,
      });

      // Math.random().toString(36) example: "0.1234abcd..."
      // We want substring(2, 8) to be "1234ab"
      // Let's mock Math.random to return something predictable in base 36
      const mockMathRandom = vi.fn().mockReturnValue(0.123456789);
      Math.random = mockMathRandom;

      const result = generateSecureSessionCode();

      expect(mockMathRandom).toHaveBeenCalled();
      // 0.123456789.toString(36) is '0.4fzzzxj...', so the code is '4FZZZX'
      expect(result).toBe('4FZZZX');
    });

    it('pads the end with 0s if Math.random string is too short', () => {
      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        configurable: true,
      });

      // 0.toString(36) is "0"
      const mockMathRandom = vi.fn().mockReturnValue(0);
      Math.random = mockMathRandom;

      const result = generateSecureSessionCode();

      expect(mockMathRandom).toHaveBeenCalled();
      expect(result).toBe('000000');
      expect(result.length).toBe(6);
    });
  });
});
