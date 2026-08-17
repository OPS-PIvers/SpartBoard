import { describe, it, expect } from 'vitest';
import { removeBackgroundFloodFill, trimImageData } from './imageWorker';

/**
 * Builds an RGBA Uint8ClampedArray for a `width`x`height` image. Every pixel
 * defaults to a fully-transparent pixel that still carries non-zero color
 * channels (`bgColor`) — this mirrors real-world output from
 * `removeBackgroundFloodFill`, which zeroes only the alpha byte
 * (`data[offset + 3] = 0`) and leaves R/G/B untouched. `opaqueRect` paints an
 * inclusive [x0,x1] x [y0,y1] block fully opaque with `fgColor`.
 */
function buildImage(
  width: number,
  height: number,
  opaqueRect: { x0: number; x1: number; y0: number; y1: number },
  bgColor: [number, number, number] = [100, 50, 25],
  fgColor: [number, number, number] = [10, 10, 10]
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const inRect =
        x >= opaqueRect.x0 &&
        x <= opaqueRect.x1 &&
        y >= opaqueRect.y0 &&
        y <= opaqueRect.y1;
      if (inRect) {
        data[offset] = fgColor[0];
        data[offset + 1] = fgColor[1];
        data[offset + 2] = fgColor[2];
        data[offset + 3] = 255;
      } else {
        // Fully transparent, but NOT zeroed color channels — this is the
        // shape flood-fill background removal actually produces.
        data[offset] = bgColor[0];
        data[offset + 1] = bgColor[1];
        data[offset + 2] = bgColor[2];
        data[offset + 3] = 0;
      }
    }
  }
  return data;
}

describe('trimImageData', () => {
  it('trims to the opaque content, ignoring color data left behind under transparent pixels', () => {
    // 10x10 image; only the 2x2 block at (4,4)-(5,5) is opaque. Every other
    // pixel is transparent but still carries non-zero RGB — exactly what
    // removeBackgroundFloodFill's alpha-only zeroing produces.
    const width = 10;
    const height = 10;
    const data = buildImage(width, height, { x0: 4, x1: 5, y0: 4, y1: 5 });

    const result = trimImageData(data, width, height);

    expect(result.found).toBe(true);
    // Content is at (4,4)-(5,5); padding of 2 clamped to the canvas gives
    // [2,7] on both axes → a 6x6 trimmed box, not the full 10x10 canvas.
    expect(result.minX).toBe(2);
    expect(result.minY).toBe(2);
    expect(result.width).toBe(6);
    expect(result.height).toBe(6);
  });

  it('reports not-found for an image that is fully transparent, even with stray color data', () => {
    const width = 5;
    const height = 5;
    // Rect outside the canvas bounds -> nothing opaque.
    const data = buildImage(width, height, { x0: 99, x1: 99, y0: 99, y1: 99 });

    const result = trimImageData(data, width, height);

    expect(result.found).toBe(false);
  });

  it('still detects a fully-opaque image spanning the whole canvas', () => {
    const width = 4;
    const height = 4;
    const data = buildImage(width, height, {
      x0: 0,
      x1: width - 1,
      y0: 0,
      y1: height - 1,
    });

    const result = trimImageData(data, width, height);

    expect(result.found).toBe(true);
    expect(result.minX).toBe(0);
    expect(result.minY).toBe(0);
    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
  });
});

describe('removeBackgroundFloodFill -> trimImageData', () => {
  it('trims to the content that survived background removal', () => {
    // The interaction that actually broke: flood-fill zeroes only the alpha
    // byte, so every cleared background pixel keeps its RGB. Feeding that
    // straight into trim is the real pipeline, not a synthesized fixture.
    const width = 10;
    const height = 10;
    const bg: [number, number, number] = [200, 200, 200];
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const inContent = x >= 4 && x <= 5 && y >= 4 && y <= 5;
        const [r, g, b] = inContent ? [10, 10, 10] : bg;
        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = 255;
      }
    }

    const cleared = removeBackgroundFloodFill(data, width, height);

    // Background cleared to alpha 0 but RGB retained; content untouched.
    expect(cleared[0 * 4 + 3]).toBe(0);
    expect(cleared[0 * 4]).toBe(bg[0]);
    const contentOffset = (4 * width + 4) * 4;
    expect(cleared[contentOffset + 3]).toBe(255);

    const result = trimImageData(cleared, width, height);

    expect(result.found).toBe(true);
    expect(result.minX).toBe(2);
    expect(result.minY).toBe(2);
    expect(result.width).toBe(6);
    expect(result.height).toBe(6);
  });
});
