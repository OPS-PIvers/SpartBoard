/**
 * Pins the FUNCTIONS-SIDE quiz-code canonicalization. These cases are kept
 * IDENTICAL to the client suite (`tests/utils/quizCode.test.ts`) on purpose: the
 * two `normalizeQuizCode` copies (client + functions) must agree byte-for-byte
 * or `pinLoginV1` would resolve a different `quiz_sessions` doc than the teacher
 * created. A change to either normalizer that breaks parity fails one suite.
 */
import { describe, it, expect } from 'vitest';
import { normalizeQuizCode } from './quizCode';

describe('normalizeQuizCode (functions)', () => {
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
