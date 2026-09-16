import { describe, it, expect } from 'vitest';
import { mergeSubsetOrder, placeRelative, shiftId } from './reorderIds';

describe('placeRelative', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves an item before the target', () => {
    expect(placeRelative(ids, 'd', 'b', 'before')).toEqual([
      'a',
      'd',
      'b',
      'c',
    ]);
  });

  it('moves an item after the target', () => {
    expect(placeRelative(ids, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('returns null when the drop leaves the order unchanged', () => {
    expect(placeRelative(ids, 'b', 'c', 'before')).toBeNull();
    expect(placeRelative(ids, 'c', 'b', 'after')).toBeNull();
    expect(placeRelative(ids, 'b', 'b', 'after')).toBeNull();
  });

  it('returns null for ids outside the list', () => {
    expect(placeRelative(ids, 'z', 'a', 'before')).toBeNull();
  });
});

describe('shiftId', () => {
  it('swaps with the neighbour', () => {
    expect(shiftId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(shiftId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('returns null at the ends', () => {
    expect(shiftId(['a', 'b'], 'a', -1)).toBeNull();
    expect(shiftId(['a', 'b'], 'b', 1)).toBeNull();
  });
});

describe('mergeSubsetOrder', () => {
  it('keeps non-members in place and permutes members within their slots', () => {
    // Collection boards b and d swap; a, c and e (other collections) hold still.
    expect(mergeSubsetOrder(['a', 'b', 'c', 'd', 'e'], ['d', 'b'])).toEqual([
      'a',
      'd',
      'c',
      'b',
      'e',
    ]);
  });

  it('accepts a full reordering', () => {
    expect(mergeSubsetOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('ignores unknown ids', () => {
    expect(mergeSubsetOrder(['a', 'b'], ['x', 'b', 'a'])).toEqual(['b', 'a']);
  });
});
