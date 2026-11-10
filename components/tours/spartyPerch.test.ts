import { describe, expect, it } from 'vitest';
import { spartyHitsChrome, spartyPerch } from './spartyPerch';

const tip = { x: 400, y: 300, w: 320 };

describe('spartyPerch', () => {
  it('sits on the top-left corner by default', () => {
    expect(spartyPerch(tip, null, null)).toBe('left');
    expect(spartyPerch(tip, null, { edge: 'bottom', offset: 20 })).toBe('left');
    expect(spartyPerch({ ...tip, y: undefined }, null, null)).toBe('left');
  });

  it('moves right when the arrow is at the left', () => {
    expect(spartyPerch(tip, null, { edge: 'left', offset: 30 })).toBe('right');
    expect(spartyPerch(tip, null, { edge: 'top', offset: 40 })).toBe('right');
  });

  it('never covers the target', () => {
    // A wide target right above the tip blocks both corners.
    const wide = { x: 380, y: 260, w: 400, h: 36 };
    expect(spartyPerch(tip, wide, { edge: 'top', offset: 160 })).toBe('inline');
    // A target above the left corner only sends him right.
    const leftOnly = { x: 380, y: 250, w: 60, h: 40 };
    expect(spartyPerch(tip, leftOnly, null)).toBe('right');
  });

  it('sits beside the title when the top of the screen would cut him off', () => {
    expect(spartyPerch({ ...tip, y: 20 }, null, null)).toBe('inline');
  });
});

describe('spartyHitsChrome', () => {
  const view = { w: 390, h: 844 };
  const sparty = { x: 0, y: 24, w: 64, h: 64 };
  it('hits the bar or chip it overlaps, and ignores ones out of the way or unrendered', () => {
    expect(
      spartyHitsChrome(sparty, [{ x: 6, y: 12, w: 378, h: 44 }], view)
    ).toBe(true);
    expect(
      spartyHitsChrome(sparty, [{ x: 200, y: 760, w: 180, h: 44 }], view)
    ).toBe(false);
    expect(spartyHitsChrome(sparty, [{ x: 0, y: 0, w: 0, h: 0 }], view)).toBe(
      false
    );
  });
  it('hits when he would leave the screen', () => {
    expect(spartyHitsChrome({ ...sparty, x: -4 }, [], view)).toBe(true);
    expect(spartyHitsChrome({ ...sparty, x: 340 }, [], view)).toBe(true);
    expect(spartyHitsChrome({ ...sparty, y: -1 }, [], view)).toBe(true);
  });
});
