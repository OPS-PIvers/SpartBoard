import { describe, it, expect } from 'vitest';
import type { QuizPublicQuestion } from '@/types';
import { groupIntoStimulusUnits, shufflePublicQuestions } from './quizShuffle';

const q = (id: string, stimulusIds?: string[]): QuizPublicQuestion => ({
  id,
  type: 'FIB',
  text: `Question ${id}`,
  timeLimit: 0,
  ...(stimulusIds ? { stimulusIds } : {}),
});

describe('groupIntoStimulusUnits', () => {
  it('makes singleton units when no stimuli are present', () => {
    const units = groupIntoStimulusUnits([q('a'), q('b'), q('c')]);
    expect(units.map((u) => u.map((x) => x.id))).toEqual([['a'], ['b'], ['c']]);
  });

  it('groups questions sharing a stimulus id, preserving relative order', () => {
    const units = groupIntoStimulusUnits([
      q('a', ['s1']),
      q('b'),
      q('c', ['s1']),
      q('d', ['s2']),
    ]);
    expect(units.map((u) => u.map((x) => x.id))).toEqual([
      ['a', 'c'],
      ['b'],
      ['d'],
    ]);
  });

  it('merges transitively-connected components (a~s1~b, b~s2~c)', () => {
    const units = groupIntoStimulusUnits([
      q('a', ['s1']),
      q('b', ['s1', 's2']),
      q('c', ['s2']),
      q('d'),
    ]);
    expect(units.map((u) => u.map((x) => x.id))).toEqual([
      ['a', 'b', 'c'],
      ['d'],
    ]);
  });
});

describe('shufflePublicQuestions (stimulus-aware)', () => {
  it('is deterministic for a given seed and a permutation of the input', () => {
    const questions = [q('a'), q('b'), q('c'), q('d'), q('e')];
    const first = shufflePublicQuestions(questions, 'seed-1');
    const second = shufflePublicQuestions(questions, 'seed-1');
    expect(first.map((x) => x.id)).toEqual(second.map((x) => x.id));
    expect(first.map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps stimulus components contiguous in original relative order', () => {
    const questions = [
      q('a', ['s1']),
      q('b', ['s1']),
      q('c'),
      q('d', ['s2']),
      q('e', ['s2']),
      q('f'),
    ];
    for (let i = 0; i < 25; i++) {
      const ids = shufflePublicQuestions(questions, `seed-${i}`).map(
        (x) => x.id
      );
      // a must be immediately followed by b; d by e.
      expect(ids.indexOf('b')).toBe(ids.indexOf('a') + 1);
      expect(ids.indexOf('e')).toBe(ids.indexOf('d') + 1);
      expect(ids).toHaveLength(6);
    }
  });

  it('actually reorders across different seeds (sanity)', () => {
    const questions = [q('a'), q('b'), q('c'), q('d'), q('e'), q('f')];
    const orders = new Set(
      Array.from({ length: 10 }, (_, i) =>
        shufflePublicQuestions(questions, `seed-${i}`)
          .map((x) => x.id)
          .join(',')
      )
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
