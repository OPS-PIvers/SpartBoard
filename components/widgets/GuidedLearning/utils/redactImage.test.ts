import { afterEach, describe, expect, it, vi } from 'vitest';
import { redactImage, redactPixels, type PixelBuffer } from './redactImage';

// A noisy image so a blur visibly changes every pixel it touches.
function noise(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 7;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    data[i] = i % 4 === 3 ? 255 : seed % 256;
  }
  return { data, width, height };
}

const pixel = (buf: PixelBuffer, x: number, y: number) =>
  Array.from(
    buf.data.slice((y * buf.width + x) * 4, (y * buf.width + x) * 4 + 4)
  );

// Rect covering x 20..60, y 25..75 of a 100×80 image.
const RECT = { xPct: 20, yPct: 31.25, wPct: 40, hPct: 62.5 };

describe('redactPixels', () => {
  it('changes pixels inside a blurred rect and leaves the rest untouched', () => {
    const source = noise(100, 80);
    const out = { ...source, data: source.data.slice() };
    redactPixels(out, [RECT], 'blur');

    let changed = 0;
    let total = 0;
    for (let y = 25; y < 75; y++) {
      for (let x = 20; x < 60; x++) {
        total++;
        if (pixel(out, x, y).join() !== pixel(source, x, y).join()) changed++;
      }
    }
    expect(changed / total).toBeGreaterThan(0.95);

    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 100; x++) {
        if (x >= 20 && x < 60 && y >= 25 && y < 75) continue;
        expect(pixel(out, x, y)).toEqual(pixel(source, x, y));
      }
    }
  });

  it('flattens text-like detail so neighbouring pixels end up close', () => {
    const buf = noise(100, 80);
    redactPixels(buf, [RECT], 'blur');
    const a = pixel(buf, 40, 50);
    const b = pixel(buf, 41, 50);
    for (let c = 0; c < 3; c++) expect(Math.abs(a[c] - b[c])).toBeLessThan(6);
  });

  it('fills a solid rect with one opaque colour', () => {
    const buf = noise(100, 80);
    redactPixels(buf, [RECT], 'solid');
    expect(pixel(buf, 20, 25)).toEqual(pixel(buf, 59, 74));
    expect(pixel(buf, 30, 30)[3]).toBe(255);
  });

  it('clamps rects that run off the image', () => {
    const buf = noise(10, 10);
    expect(() =>
      redactPixels(buf, [{ xPct: 80, yPct: 80, wPct: 50, hPct: 50 }], 'blur')
    ).not.toThrow();
  });
});

describe('redactImage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws at natural size, redacts and encodes a WebP', async () => {
    const source = noise(100, 80);
    let painted: PixelBuffer | null = null;
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 100, height: 80, close })
    );
    const ctx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ ...source, data: source.data.slice() })),
      putImageData: vi.fn((img: PixelBuffer) => {
        painted = img;
      }),
    };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function (cb, type) {
        cb(new Blob(['png'], { type }));
      });

    const out = await redactImage(new Blob(['src']), [RECT], { mode: 'blur' });

    expect(out.type).toBe('image/webp');
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/webp',
      0.85
    );
    expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 100, 80);
    expect(painted).not.toBeNull();
    const result = painted as unknown as PixelBuffer;
    expect(pixel(result, 0, 0)).toEqual(pixel(source, 0, 0));
    expect(pixel(result, 40, 50)).not.toEqual(pixel(source, 40, 50));
    expect(close).toHaveBeenCalled();
    getContext.mockRestore();
    toBlob.mockRestore();
  });
});
