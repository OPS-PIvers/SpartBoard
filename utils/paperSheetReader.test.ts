import { describe, expect, it } from 'vitest';
import { paintSyntheticSheet } from '@/tests/testHelpers/paperSheetRaster';
import { QUESTIONS_PER_PAGE } from './paperSheetLayout';
import { paperBatchTag } from './paperSheetMarker';
import {
  READER_THRESHOLDS,
  classifyRow,
  fitAffine,
  readPaperPage,
  rowsOnPage,
  type PageRead,
} from './paperSheetReader';

const marker = {
  batchTag: paperBatchTag('batch-1'),
  seat: 17,
  page: 1,
  isKeySheet: false,
};

const ok = (result: ReturnType<typeof readPaperPage>): PageRead => {
  expect(result.status).toBe('ok');
  return result as PageRead;
};

describe('readPaperPage', () => {
  it('reads every bubbled answer on a clean scan', () => {
    const marks = [0, 1, 2, 3, 0, 3, 2, 1, 1, 1].map((choice, row) => ({
      row,
      choice,
    }));
    const page = paintSyntheticSheet({
      marker,
      questionCount: 10,
      choiceCount: 4,
      marks,
    });
    const read = ok(readPaperPage(page, { questionCount: 10, choiceCount: 4 }));
    expect(read.marker).toEqual(marker);
    expect(read.rotated).toBe(false);
    expect(read.rows.map((r) => r.choice)).toEqual(marks.map((m) => m.choice));
    expect(read.rows.every((r) => r.doubt === undefined)).toBe(true);
    expect(read.registrationResidualMm).toBeLessThan(0.3);
  });

  it('reads a page fed upside down and still assigns rows correctly', () => {
    const marks = [
      { row: 0, choice: 2 },
      { row: 24, choice: 0 },
      { row: 30, choice: 3 },
    ];
    const page = paintSyntheticSheet({
      marker,
      questionCount: 50,
      choiceCount: 4,
      marks,
      rotated: true,
    });
    const read = ok(readPaperPage(page, { questionCount: 50, choiceCount: 4 }));
    expect(read.rotated).toBe(true);
    expect(read.marker.seat).toBe(17);
    expect(read.rows[0].choice).toBe(2);
    expect(read.rows[24].choice).toBe(0);
    expect(read.rows[30].choice).toBe(3);
    expect(read.rows.filter((r) => r.choice !== null)).toHaveLength(3);
  });

  it('is indifferent to print scale and scanner offset', () => {
    for (const pxPerMm of [5.5, 7.87, 11.8]) {
      const page = paintSyntheticSheet({
        marker,
        questionCount: 5,
        choiceCount: 5,
        marks: [{ row: 2, choice: 4 }],
        pxPerMm,
        offsetPx: { x: 37, y: 19 },
      });
      const read = ok(
        readPaperPage(page, { questionCount: 5, choiceCount: 5 })
      );
      expect(read.rows[2].choice).toBe(4);
      expect(read.pxPerMm).toBeCloseTo(pxPerMm, 0);
    }
  });

  it('corrects a crooked feed through the registration marks', () => {
    const marks = [0, 1, 2, 3, 3, 2, 1, 0].map((choice, row) => ({
      row,
      choice,
    }));
    const page = paintSyntheticSheet({
      marker,
      questionCount: 50,
      choiceCount: 4,
      marks,
      skewDeg: 1.5,
    });
    const read = ok(readPaperPage(page, { questionCount: 50, choiceCount: 4 }));
    expect(read.rows.slice(0, 8).map((r) => r.choice)).toEqual(
      marks.map((m) => m.choice)
    );
    expect(read.rows.slice(8).every((r) => r.choice === null && !r.doubt)).toBe(
      true
    );
    expect(read.registrationResidualMm).toBeLessThan(0.3);
  });

  it('flags a double bubble instead of picking one', () => {
    const page = paintSyntheticSheet({
      marker,
      questionCount: 3,
      choiceCount: 4,
      marks: [
        { row: 1, choice: 0 },
        { row: 1, choice: 3 },
      ],
    });
    const read = ok(readPaperPage(page, { questionCount: 3, choiceCount: 4 }));
    expect(read.rows[1]).toMatchObject({ choice: null, doubt: 'multiple' });
  });

  it('flags a faint mark as unclear rather than reading it either way', () => {
    const page = paintSyntheticSheet({
      marker,
      questionCount: 3,
      choiceCount: 4,
      marks: [{ row: 0, choice: 1, density: 0.32 }],
      seed: 7,
    });
    const read = ok(readPaperPage(page, { questionCount: 3, choiceCount: 4 }));
    expect(read.rows[0]).toMatchObject({ choice: null, doubt: 'unclear' });
  });

  it('flags a filled bubble beside a half-erased one', () => {
    const page = paintSyntheticSheet({
      marker,
      questionCount: 3,
      choiceCount: 4,
      marks: [
        { row: 2, choice: 1 },
        { row: 2, choice: 2, density: 0.32 },
      ],
      seed: 3,
    });
    const read = ok(readPaperPage(page, { questionCount: 3, choiceCount: 4 }));
    expect(read.rows[2]).toMatchObject({ choice: null, doubt: 'unclear' });
  });

  it('leaves an untouched row blank with no doubt', () => {
    const page = paintSyntheticSheet({
      marker,
      questionCount: 4,
      choiceCount: 4,
    });
    const read = ok(readPaperPage(page, { questionCount: 4, choiceCount: 4 }));
    expect(read.rows).toHaveLength(4);
    for (const row of read.rows) {
      expect(row.choice).toBeNull();
      expect(row.doubt).toBeUndefined();
      expect(Math.max(...row.fills)).toBeLessThan(READER_THRESHOLDS.blank);
    }
  });

  it('survives scanner speckle', () => {
    const page = paintSyntheticSheet({
      marker,
      questionCount: 6,
      choiceCount: 4,
      marks: [{ row: 5, choice: 3 }],
      noise: 0.004,
      seed: 11,
    });
    const read = ok(readPaperPage(page, { questionCount: 6, choiceCount: 4 }));
    expect(read.rows[5].choice).toBe(3);
    expect(
      read.rows.slice(0, 5).every((r) => r.choice === null && !r.doubt)
    ).toBe(true);
  });

  it('reads only the rows the last page carries', () => {
    const page = paintSyntheticSheet({
      marker: { ...marker, page: 2 },
      questionCount: QUESTIONS_PER_PAGE + 7,
      choiceCount: 4,
      marks: [{ row: 6, choice: 1 }],
    });
    const read = ok(
      readPaperPage(page, {
        questionCount: QUESTIONS_PER_PAGE + 7,
        choiceCount: 4,
      })
    );
    expect(read.marker.page).toBe(2);
    expect(read.rows).toHaveLength(7);
    expect(read.rows[6].choice).toBe(1);
  });

  it('gives every row a crop that lands on the page', () => {
    const page = paintSyntheticSheet({
      marker,
      questionCount: 50,
      choiceCount: 4,
    });
    const read = ok(readPaperPage(page, { questionCount: 50, choiceCount: 4 }));
    for (const row of read.rows) {
      expect(row.crop.w).toBeGreaterThan(0);
      expect(row.crop.h).toBeGreaterThan(0);
      expect(row.crop.x + row.crop.w).toBeLessThanOrEqual(page.width);
      expect(row.crop.y + row.crop.h).toBeLessThanOrEqual(page.height);
    }
    const first = read.rows[0].crop;
    const second = read.rows[1].crop;
    expect(second.y).toBeGreaterThan(first.y);
  });

  it('rejects a page missing a registration mark', () => {
    const page = paintSyntheticSheet({
      marker,
      questionCount: 3,
      choiceCount: 4,
      dropRegistrationMark: 2,
    });
    expect(readPaperPage(page, { questionCount: 3, choiceCount: 4 })).toEqual({
      status: 'no-registration',
    });
  });

  it('rejects a blank page rather than inventing a seat', () => {
    const width = 400;
    const height = 520;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    expect(
      readPaperPage(
        { width, height, data },
        { questionCount: 3, choiceCount: 4 }
      )
    ).toEqual({ status: 'no-registration' });
  });

  it('reports a corrupted marker instead of guessing', () => {
    const page = paintSyntheticSheet({
      marker,
      questionCount: 3,
      choiceCount: 4,
    });
    // Scribble across the marker grid so the checksum cannot hold.
    const px = 7.87;
    for (let y = Math.round(22 * px); y < Math.round(38 * px); y += 1) {
      for (let x = Math.round(140 * px); x < Math.round(200 * px); x += 1) {
        const o = (y * page.width + x) * 4;
        page.data[o] = page.data[o + 1] = page.data[o + 2] = 0;
      }
    }
    expect(readPaperPage(page, { questionCount: 3, choiceCount: 4 })).toEqual({
      status: 'no-marker',
    });
  });
});

describe('classifyRow', () => {
  it('treats the band between blank and filled as doubt', () => {
    expect(classifyRow([0.05, 0.9, 0.1, 0.02])).toEqual({ choice: 1 });
    expect(classifyRow([0.05, 0.3, 0.1, 0.02])).toEqual({
      choice: null,
      doubt: 'unclear',
    });
    expect(classifyRow([0.8, 0.9, 0.1, 0.02])).toEqual({
      choice: null,
      doubt: 'multiple',
    });
    expect(classifyRow([0, 0, 0, 0])).toEqual({ choice: null });
  });
});

describe('fitAffine', () => {
  it('recovers scale, offset and rotation from four points', () => {
    const t = { a: 7.5, b: 0.02, c: 40, d: -0.02, e: 7.5, f: 30 };
    const pairs = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 0, y: 270 },
      { x: 200, y: 270 },
    ].map((mm) => ({
      mm,
      px: {
        x: t.a * mm.x + t.b * mm.y + t.c,
        y: t.d * mm.x + t.e * mm.y + t.f,
      },
    }));
    const fit = fitAffine(pairs);
    expect(fit).not.toBeNull();
    expect(fit?.residualPx).toBeLessThan(1e-6);
    expect(fit?.transform.a).toBeCloseTo(7.5, 6);
    expect(fit?.transform.f).toBeCloseTo(30, 6);
  });

  it('refuses collinear points', () => {
    const pairs = [0, 1, 2].map((i) => ({
      mm: { x: i, y: i },
      px: { x: i, y: i },
    }));
    expect(fitAffine(pairs)).toBeNull();
  });
});

describe('rowsOnPage', () => {
  it('splits questions across pages at the page capacity', () => {
    expect(rowsOnPage(1, 10)).toBe(10);
    expect(rowsOnPage(1, 120)).toBe(QUESTIONS_PER_PAGE);
    expect(rowsOnPage(3, 120)).toBe(120 - 2 * QUESTIONS_PER_PAGE);
    expect(rowsOnPage(4, 120)).toBe(0);
  });
});
