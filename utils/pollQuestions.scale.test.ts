import { describe, expect, it } from 'vitest';
import {
  makeScaleOptions,
  scaleAverage,
  withVotesReset,
} from './pollQuestions';

describe('rating scale helpers', () => {
  it('numbers the options from 1', () => {
    expect(makeScaleOptions(5).map((o) => o.label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(makeScaleOptions(10)).toHaveLength(10);
  });

  it('averages counts with option i worth i + 1', () => {
    expect(scaleAverage([0, 0, 0, 0, 0])).toBeNull();
    expect(scaleAverage([1, 0, 0, 0, 1])).toBe(3);
    expect(scaleAverage([0, 2, 1, 0, 0])).toBeCloseTo(7 / 3);
  });
});

describe('withVotesReset', () => {
  it('keeps hidden typed answers hidden, since Resume reads the same answers', () => {
    const next = withVotesReset({
      questions: [{ id: 'q1', question: 'Why?', kind: 'text', options: [] }],
      hiddenResponses: ['q1:0_u1'],
    });
    expect(next.hiddenResponses).toEqual(['q1:0_u1']);
  });
});
