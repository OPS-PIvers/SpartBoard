import { describe, it, expect } from 'vitest';
import { enhanceScanContrast } from '@/utils/scanContrast';

const W = 120;
const H = 60;

// Grey, unevenly lit paper with one faint pencil stroke across the middle rows.
function scan(paperAt: (x: number) => number, inkShare: number) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const paper = paperAt(x);
      const v = y >= 28 && y < 32 ? paper * inkShare : paper;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v * 0.95;
      data[i + 3] = 255;
    }
  }
  return data;
}

const px = (data: Uint8ClampedArray, x: number, y: number) =>
  data[(y * W + x) * 4];

describe('enhanceScanContrast', () => {
  it('turns uneven grey paper white and faint pencil dark', () => {
    const data = scan((x) => 230 - x * 0.6, 0.78);
    enhanceScanContrast(data, W, H);
    for (const x of [5, 60, 115]) {
      expect(px(data, x, 5)).toBeGreaterThanOrEqual(250);
      expect(px(data, x, 30)).toBeLessThan(110);
    }
  });

  it('removes the paper tint', () => {
    const data = scan(() => 220, 0.78);
    enhanceScanContrast(data, W, H);
    const i = (5 * W + 60) * 4;
    expect(data[i + 2]).toBe(data[i]);
  });

  it('does not widen strokes', () => {
    const data = scan(() => 220, 0.5);
    enhanceScanContrast(data, W, H);
    const darkRows = Array.from({ length: H }, (_, y) =>
      px(data, 60, y)
    ).filter((v) => v < 128).length;
    expect(darkRows).toBe(4);
  });

  it('leaves blank paper blank', () => {
    const data = scan(() => 210, 1);
    enhanceScanContrast(data, W, H);
    expect(
      Math.min(...Array.from({ length: H }, (_, y) => px(data, 60, y)))
    ).toBeGreaterThanOrEqual(250);
  });

  it('keeps alpha and ignores empty input', () => {
    const data = scan(() => 220, 0.6);
    enhanceScanContrast(data, W, H);
    expect(data[3]).toBe(255);
    expect(() =>
      enhanceScanContrast(new Uint8ClampedArray(0), 0, 0)
    ).not.toThrow();
  });

  it('handles tiny images and widths off the cell grid', () => {
    for (const [w, h] of [
      [1, 1],
      [3, 2],
      [37, 13],
    ]) {
      const data = new Uint8ClampedArray(w * h * 4).fill(200);
      enhanceScanContrast(data, w, h);
      expect(data.every((v) => Number.isFinite(v))).toBe(true);
    }
  });
});
