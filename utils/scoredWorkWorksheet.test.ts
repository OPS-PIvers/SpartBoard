import { describe, expect, it } from 'vitest';
import { inkBounds, paddedBounds } from './scoredWorkWorksheet';

const page = (
  width: number,
  height: number,
  ink: Array<[number, number, number, number]>
) => {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x0, y0, x1, y1] of ink) {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const o = (y * width + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = 20;
      }
    }
  }
  return { width, height, data };
};

describe('inkBounds', () => {
  it('finds the box around all ink and ignores white margins', () => {
    const b = inkBounds(
      page(200, 300, [
        [40, 60, 120, 90],
        [60, 200, 150, 240],
      ])
    );
    if (!b) throw new Error('expected bounds');
    expect(b.x).toBeLessThanOrEqual(40);
    expect(b.x).toBeGreaterThanOrEqual(38);
    expect(b.x + b.w).toBeGreaterThanOrEqual(150);
    expect(b.y).toBeLessThanOrEqual(60);
    expect(b.y + b.h).toBeGreaterThanOrEqual(240);
    expect(b.w).toBeLessThan(120);
  });

  it('returns null for a blank page', () => {
    expect(inkBounds(page(100, 100, []))).toBeNull();
  });
});

describe('paddedBounds', () => {
  it('adds room but never leaves the page', () => {
    const r = paddedBounds({ x: 1, y: 1, w: 98, h: 98 }, 100, 100);
    expect(r).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    const inner = paddedBounds({ x: 40, y: 40, w: 20, h: 20 }, 1000, 1000);
    expect(inner.x).toBeLessThan(40);
    expect(inner.w).toBeGreaterThan(20);
  });
});
