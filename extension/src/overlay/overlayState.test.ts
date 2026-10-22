import { describe, expect, it } from 'vitest';
import { parseOverlayState } from './overlayState';

const valid = {
  title: 'Open Grades',
  text: 'Click Grades.',
  current: 1,
  total: 3,
  rect: { x: 10, y: 20, width: 100, height: 30 },
};

describe('parseOverlayState', () => {
  it('accepts a valid state, with or without a target', () => {
    expect(parseOverlayState(valid)).toEqual(valid);
    expect(parseOverlayState({ ...valid, rect: null })).toEqual({
      ...valid,
      rect: null,
    });
  });

  it.each([
    ['an extra key', { ...valid, html: '<b>x</b>' }],
    ['a missing key', { title: 'x', text: 'y', current: 1, total: 1 }],
    ['a step past the end', { ...valid, current: 4 }],
    ['step zero', { ...valid, current: 0 }],
    ['a fractional step', { ...valid, current: 1.5 }],
    ['a non-string title', { ...valid, title: 3 }],
    ['an oversized text', { ...valid, text: 'x'.repeat(4001) }],
    ['a rect with an extra key', { ...valid, rect: { ...valid.rect, z: 1 } }],
    ['a negative rect size', { ...valid, rect: { ...valid.rect, width: -1 } }],
    ['a NaN rect', { ...valid, rect: { ...valid.rect, x: Number.NaN } }],
  ])('refuses %s', (_, raw) => {
    expect(parseOverlayState(raw)).toBeNull();
  });

  it('refuses non-objects', () => {
    expect(parseOverlayState(null)).toBeNull();
    expect(parseOverlayState('state')).toBeNull();
  });
});
