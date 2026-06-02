/**
 * Pins the CLIENT quiz-code canonicalization. These cases are kept IDENTICAL to
 * the functions suite (`functions/src/quizCode.test.ts`) on purpose: the two
 * `normalizeQuizCode` copies (client `utils/quizCode.ts` + functions
 * `functions/src/quizCode.ts`) must agree byte-for-byte, or `pinLoginV1` would
 * resolve a different `quiz_sessions` doc than the client stored. A change to
 * either normalizer that breaks parity fails one suite.
 */
import { describe, it, expect } from 'vitest';
import { normalizeQuizCode } from '@/utils/quizCode';

describe('normalizeQuizCode (client)', () => {
  it('uppercases', () => {
    expect(normalizeQuizCode('abc123')).toBe('ABC123');
  });

  it('strips whitespace and non-alphanumerics', () => {
    expect(normalizeQuizCode('  a-b c1!2  ')).toBe('ABC12');
    expect(normalizeQuizCode('ab_cd')).toBe('ABCD');
  });

  it('is stable on an already-canonical code', () => {
    expect(normalizeQuizCode('ABC123')).toBe('ABC123');
  });

  it('returns empty when nothing alphanumeric survives', () => {
    expect(normalizeQuizCode('   ')).toBe('');
    expect(normalizeQuizCode('!!!')).toBe('');
  });
});
