import { describe, it, expect } from 'vitest';
import { seededPermutation, seededShuffle } from './quizShuffle';

/** Verbatim copy of the pre-refactor `seededShuffle` — the oracle. */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function legacySeededShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = items.slice();
  if (result.length <= 1) return result;
  const rng = mulberry32(cyrb53(seed));
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

describe('seededPermutation', () => {
  it('reproduces the legacy seededShuffle byte for byte over 200 seeds x lengths 2..8', () => {
    for (let length = 2; length <= 8; length++) {
      const items = Array.from({ length }, (_, i) => `item-${i}`);
      for (let s = 0; s < 200; s++) {
        const seed = `uid-${s}:q-${length}`;
        const viaPermutation = seededPermutation(length, seed).map(
          (i) => items[i]
        );
        expect(viaPermutation).toEqual(legacySeededShuffle(items, seed));
        expect(seededShuffle(items, seed)).toEqual(
          legacySeededShuffle(items, seed)
        );
      }
    }
  });

  it('is a true permutation of the index range', () => {
    const p = seededPermutation(6, 'seed');
    expect(p.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('returns the identity for lengths 0 and 1', () => {
    expect(seededPermutation(0, 's')).toEqual([]);
    expect(seededPermutation(1, 's')).toEqual([0]);
  });
});
