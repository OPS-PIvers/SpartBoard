import { describe, expect, it } from 'vitest';
import type { TourMarkupShape } from '@/types';
import { nextNumber, removeShape } from './markupShapes';

const num = (id: string, n: number): TourMarkupShape => ({
  id,
  kind: 'number',
  x: 0.5,
  y: 0.5,
  n,
});
const box: TourMarkupShape = {
  id: 'b',
  kind: 'box',
  x: 0,
  y: 0,
  w: 0.1,
  h: 0.1,
};

describe('markup numbers', () => {
  it('gives a new marker the next free number', () => {
    expect(nextNumber([])).toBe(1);
    expect(nextNumber([box, num('a', 1), num('c', 2)])).toBe(3);
  });

  it('closes the gap when a marker goes, keeping the order', () => {
    const left = removeShape([num('a', 1), box, num('m', 2), num('c', 3)], 'm');
    expect(left).toEqual([num('a', 1), box, num('c', 2)]);
    expect(nextNumber(left)).toBe(3);
  });

  it('leaves the numbers alone when another shape goes', () => {
    expect(removeShape([num('a', 1), box, num('c', 2)], 'b')).toEqual([
      num('a', 1),
      num('c', 2),
    ]);
  });
});
