import { describe, expect, it } from 'vitest';
import { paintSyntheticSheet } from '@/tests/testHelpers/paperSheetRaster';
import {
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  REGISTRATION_MARK_CENTERS_MM,
} from './paperSheetLayout';
import { paperBatchTag } from './paperSheetMarker';
import {
  findRegistrationMarks,
  readPaperPage,
  straightenPage,
  type GrayCrop,
  type PageRead,
  type RasterPage,
} from './paperSheetReader';
import { PAPER_KEPT_PAGE_DPI } from './paperWritten';

const SCALE = PAPER_KEPT_PAGE_DPI / 25.4;
const MARKER = {
  batchTag: paperBatchTag('batch-kept'),
  seat: 7,
  page: 1,
  isKeySheet: false,
};

const paint = (over: { rotated?: boolean; skewDeg?: number }): RasterPage =>
  paintSyntheticSheet({
    marker: MARKER,
    questionCount: 40,
    choiceCount: 4,
    marks: [{ row: 0, choice: 2 }],
    // A 200 dpi scan, fed a little off-centre.
    pxPerMm: 200 / 25.4,
    offsetPx: { x: 14, y: -9 },
    seed: 3,
    ...over,
  });

const read = (page: RasterPage): PageRead => {
  const result = readPaperPage(page, { questionCount: 40, choiceCount: 4 });
  if (result.status !== 'ok') throw new Error(`read failed: ${result.status}`);
  return result;
};

const toRgba = (gray: GrayCrop): RasterPage => {
  const data = new Uint8ClampedArray(gray.width * gray.height * 4);
  for (let i = 0; i < gray.data.length; i += 1) {
    data[i * 4] = gray.data[i];
    data[i * 4 + 1] = gray.data[i];
    data[i * 4 + 2] = gray.data[i];
    data[i * 4 + 3] = 255;
  }
  return { width: gray.width, height: gray.height, data };
};

describe('straightenPage', () => {
  it.each([
    { name: 'rotated 3°', over: { skewDeg: 3 } },
    {
      name: 'upside down and rotated -2°',
      over: { rotated: true, skewDeg: -2 },
    },
  ])('puts a $name scan upright on sheet coordinates', ({ over }) => {
    const scan = paint(over);
    const first = read(scan);
    expect(first.rotated).toBe(over.rotated === true);

    const straight = straightenPage(scan, first.mmToPx);
    expect(straight.width).toBe(1275);
    expect(straight.height).toBe(1650);
    expect(straight.width).toBe(Math.round(PAGE_WIDTH_MM * SCALE));
    expect(straight.height).toBe(Math.round(PAGE_HEIGHT_MM * SCALE));

    // Pixel (i, j) samples the millimetre at its centre, so a mark at x mm sits at x × scale − 0.5.
    const dark = Uint8Array.from(straight.data, (v) => (v < 128 ? 1 : 0));
    const marks = findRegistrationMarks(dark, straight.width, straight.height);
    expect(marks).not.toBeNull();
    marks?.forEach((px, i) => {
      const mm = REGISTRATION_MARK_CENTERS_MM[i];
      expect(Math.abs(px.x - (mm.x * SCALE - 0.5))).toBeLessThan(1);
      expect(Math.abs(px.y - (mm.y * SCALE - 0.5))).toBeLessThan(1);
    });

    // Read back, the straightened page is upright with the same marker and answer.
    const again = read(toRgba(straight));
    expect(again.rotated).toBe(false);
    expect(again.marker).toEqual(first.marker);
    expect(again.rows[0].choice).toBe(2);
    expect(again.registrationResidualMm).toBeLessThan(0.2);
    expect(again.pxPerMm).toBeCloseTo(SCALE, 1);
  });
});
