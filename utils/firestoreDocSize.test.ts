import { describe, expect, it } from 'vitest';
import {
  assertGuidedLearningDocFits,
  estimateFirestoreBytes,
  GL_MAX_DOC_BYTES,
  SetTooLargeError,
} from './firestoreDocSize';

describe('estimateFirestoreBytes', () => {
  it('follows Firestore storage-size rules', () => {
    expect(estimateFirestoreBytes('abc')).toBe(4);
    expect(estimateFirestoreBytes('é')).toBe(3);
    expect(estimateFirestoreBytes(42)).toBe(8);
    expect(estimateFirestoreBytes(true)).toBe(1);
    expect(estimateFirestoreBytes(null)).toBe(1);
    expect(estimateFirestoreBytes(['a', 1])).toBe(2 + 8);
    // "k" key (2) + "v" value (2)
    expect(estimateFirestoreBytes({ k: 'v' })).toBe(4);
    expect(estimateFirestoreBytes({ k: undefined })).toBe(0);
  });

  it('counts nested maps and arrays', () => {
    expect(estimateFirestoreBytes({ steps: [{ id: 'x' }] })).toBe(6 + (3 + 2));
  });
});

describe('assertGuidedLearningDocFits', () => {
  it('passes a normal set and refuses one over 900 KB', () => {
    expect(() =>
      assertGuidedLearningDocFits('building_guided_learning/s1', {
        title: 'Cells',
        steps: Array.from({ length: 50 }, (_, i) => ({ id: `s${i}` })),
      })
    ).not.toThrow();

    const big = { text: 'x'.repeat(GL_MAX_DOC_BYTES) };
    expect(() =>
      assertGuidedLearningDocFits('building_guided_learning/s1', big)
    ).toThrow(SetTooLargeError);
    expect(() =>
      assertGuidedLearningDocFits('building_guided_learning/s1', big)
    ).toThrow(/too large to save/);
  });
});
