import { describe, expect, it } from 'vitest';
import {
  figureCaption,
  linkIdenticalFigures,
  pixelsIdentical,
  trimPaper,
  type Pixels,
} from '@/utils/quizDocumentImport/figureMatch';

/** A white canvas with a dark block drawn at (left, top). */
function canvas(
  width: number,
  height: number,
  blocks: { left: number; top: number; w: number; h: number; shade?: number }[]
): Pixels {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const b of blocks) {
    for (let y = b.top; y < b.top + b.h; y++)
      for (let x = b.left; x < b.left + b.w; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = b.shade ?? 20;
      }
  }
  return { width, height, data };
}

describe('trimPaper', () => {
  it('cuts the white margin a model box leaves around a figure', () => {
    const trimmed = trimPaper(
      canvas(20, 10, [{ left: 3, top: 2, w: 5, h: 4 }])
    );
    expect(trimmed).toMatchObject({ width: 5, height: 4 });
  });

  it('finds nothing on a blank crop', () => {
    expect(trimPaper(canvas(4, 4, []))).toBeNull();
  });
});

describe('pixelsIdentical', () => {
  const map = [
    { left: 0, top: 0, w: 6, h: 6 },
    { left: 7, top: 2, w: 3, h: 4, shade: 120 },
  ];

  it('matches the same picture cropped with different margins', () => {
    const a = canvas(
      30,
      20,
      map.map((b) => ({ ...b, left: b.left + 4, top: b.top + 3 }))
    );
    const b = canvas(
      16,
      12,
      map.map((b) => ({ ...b, left: b.left + 1, top: b.top + 1 }))
    );
    expect(pixelsIdentical(a, b)).toBe(true);
  });

  it('keeps a picture that differs by one shade beyond the tolerance apart', () => {
    const a = canvas(12, 8, map);
    const b = canvas(12, 8, [...map.slice(0, 1), { ...map[1], shade: 150 }]);
    expect(pixelsIdentical(a, b)).toBe(false);
  });

  it('keeps pictures of different sizes apart', () => {
    expect(
      pixelsIdentical(
        canvas(12, 8, [{ left: 0, top: 0, w: 6, h: 6 }]),
        canvas(12, 8, [{ left: 0, top: 0, w: 6, h: 5 }])
      )
    ).toBe(false);
  });
});

describe('linkIdenticalFigures', () => {
  const map = canvas(8, 8, [{ left: 1, top: 1, w: 5, h: 5 }]);
  const other = canvas(8, 8, [{ left: 1, top: 1, w: 3, h: 5 }]);

  it('links a later version to the first version printing the same picture', () => {
    expect(
      linkIdenticalFigures([
        { id: 'a1', version: 0, pixels: map },
        { id: 'a2', version: 0, pixels: other },
        { id: 'b1', version: 1, pixels: other },
        { id: 'c1', version: 2, pixels: map },
      ])
    ).toEqual({ b1: 'a2', c1: 'a1' });
  });

  it('never links two figures inside one version', () => {
    expect(
      linkIdenticalFigures([
        { id: 'a1', version: 0, pixels: map },
        { id: 'a2', version: 0, pixels: map },
      ])
    ).toEqual({});
  });

  it('links the same crop without decoding it', () => {
    expect(
      linkIdenticalFigures([
        { id: 'a1', version: 0, sourceKey: 's' },
        { id: 'b1', version: 1, sourceKey: 's' },
      ])
    ).toEqual({ b1: 'a1' });
  });
});

describe('figureCaption', () => {
  it('takes the printed label of the figure the box lines up with', () => {
    const figures = [
      {
        page: 2,
        x: 0.1,
        y: 0.1,
        width: 0.4,
        height: 0.3,
        label: 'MAP #1',
        versions: [],
      },
      {
        page: 2,
        x: 0.5,
        y: 0.1,
        width: 0.4,
        height: 0.3,
        label: 'MAP #2',
        versions: [],
      },
    ];
    expect(
      figureCaption(
        { page: 2, x: 0.52, y: 0.11, width: 0.38, height: 0.3 },
        figures
      )
    ).toBe('MAP #2');
    expect(
      figureCaption(
        { page: 3, x: 0.52, y: 0.11, width: 0.38, height: 0.3 },
        figures
      )
    ).toBeUndefined();
  });
});
