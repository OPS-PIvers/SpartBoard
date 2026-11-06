import { describe, expect, it } from 'vitest';
import { spartyPerch } from './spartyPerch';

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
