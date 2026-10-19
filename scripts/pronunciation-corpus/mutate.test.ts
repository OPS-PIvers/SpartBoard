import { describe, expect, it } from 'vitest';
import vocab from '@/utils/pronunciation/xlsr53EspeakVocab.json';
import { applyMutation, generateMutations, HIGH_LOAD_SWAPS } from './mutate';

describe('generateMutations', () => {
  it('turns a tap into a trill expectation under es-trill', () => {
    const m = generateMutations(['p', 'e', 'ɾ', 'o'], 'es');
    expect(m).toContainEqual({
      position: 2,
      spoken: 'ɾ',
      target: 'r',
      kind: 'group',
      groupId: 'es-trill',
    });
  });

  it('applies final-only pairs at the last position only', () => {
    const final = generateMutations(['h', 'ʊ', 'n', 'd'], 'de');
    expect(final).toContainEqual({
      position: 3,
      spoken: 'd',
      target: 't',
      kind: 'group',
      groupId: 'de-final',
    });
    const medial = generateMutations(['d', 'a', 'n'], 'de');
    expect(medial.some((x) => x.groupId === 'de-final')).toBe(false);
  });

  it('never calls a tolerated or grouped pair high-load', () => {
    // ɾ heard for an expected r is tolerated in Spanish, so r/ɾ is not a high-load swap.
    for (const m of generateMutations(['p', 'e', 'r', 'o', 'l', 's'], 'es')) {
      if (m.kind === 'high-load')
        expect(`${m.target}→${m.spoken}`).not.toBe('ɾ→r');
    }
    // de-final makes t→d at the end a group pair, not high-load; k↔t still is.
    const de = generateMutations(['b', 'a', 'k'], 'de');
    expect(de).toContainEqual({
      position: 2,
      spoken: 'k',
      target: 't',
      kind: 'high-load',
    });
  });

  it('offers high-load swaps in both directions', () => {
    const m = generateMutations(['l', 'i'], 'en');
    expect(m).toContainEqual({
      position: 0,
      spoken: 'l',
      target: 'n',
      kind: 'high-load',
    });
    expect(m).toContainEqual({
      position: 1,
      spoken: 'i',
      target: 'e',
      kind: 'high-load',
    });
  });

  it('only uses tokens the model can emit', () => {
    for (const [a, b] of HIGH_LOAD_SWAPS) {
      expect(vocab).toHaveProperty(a);
      expect(vocab).toHaveProperty(b);
    }
  });
});

describe('applyMutation', () => {
  it('changes exactly one token', () => {
    expect(
      applyMutation(['l', 'o', 'β', 'o'], {
        position: 0,
        spoken: 'l',
        target: 'n',
        kind: 'high-load',
      })
    ).toEqual(['n', 'o', 'β', 'o']);
  });

  it('refuses a mutation that does not match the reference', () => {
    expect(() =>
      applyMutation(['a'], {
        position: 0,
        spoken: 'l',
        target: 'n',
        kind: 'high-load',
      })
    ).toThrow();
  });
});
