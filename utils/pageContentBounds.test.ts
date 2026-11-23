import { describe, expect, it } from 'vitest';
import { pageContentBounds } from './pageContentBounds';

/** A white RGBA page with `ink` pixels set to black. */
const page = (w: number, h: number, ink: [number, number][]) => {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x, y] of ink) data.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3);
  return data;
};

describe('pageContentBounds', () => {
  it('finds the inked rectangle and pads it inside the page', () => {
    const data = page(20, 30, [
      [5, 4],
      [12, 20],
    ]);
    expect(pageContentBounds(data, 20, 30, 2)).toEqual({
      x: 3,
      y: 2,
      w: 12,
      h: 21,
    });
    expect(pageContentBounds(data, 20, 30, 50)).toEqual({
      x: 0,
      y: 0,
      w: 20,
      h: 30,
    });
  });

  it('treats a blank, tinted or transparent page as having no content', () => {
    expect(pageContentBounds(page(10, 10, []), 10, 10, 2)).toBeNull();
    const tinted = new Uint8ClampedArray(400).fill(245);
    expect(pageContentBounds(tinted, 10, 10, 2)).toBeNull();
    const clear = page(10, 10, [[3, 3]]);
    clear[(3 * 10 + 3) * 4 + 3] = 0;
    expect(pageContentBounds(clear, 10, 10, 2)).toBeNull();
  });
});
