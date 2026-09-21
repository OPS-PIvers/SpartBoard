import { describe, expect, it } from 'vitest';
import { paintSyntheticSheet } from '@/tests/testHelpers/paperSheetRaster';
import {
  BUBBLE_LETTER_GREY,
  MIN_BUBBLE_LETTER_GREY,
  QUESTIONS_PER_PAGE,
  ROWS_PER_COLUMN,
  STIMULUS_RECT_MM,
} from './paperSheetLayout';
import { paperBatchTag } from './paperSheetMarker';
import {
  READER_THRESHOLDS,
  classifyRow,
  fitAffine,
  otsuThreshold,
  readPaperPage,
  rowsOnPage,
  toGrayscale,
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

  it('reads a light check mark as the answer when the row is otherwise clean', () => {
    const page = paintSyntheticSheet({
      marker,
      questionCount: 3,
      choiceCount: 4,
      marks: [{ row: 0, choice: 1, density: 0.32 }],
      seed: 7,
    });
    const read = ok(readPaperPage(page, { questionCount: 3, choiceCount: 4 }));
    expect(read.rows[0]).toMatchObject({ choice: 1 });
  });

  it('reads the filled bubble beside a half-erased one', () => {
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
    expect(read.rows[2]).toMatchObject({ choice: 1 });
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
      expect(Math.max(...row.fills)).toBeLessThan(READER_THRESHOLDS.faint);
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

  it('reads a sheet whose bubbles carry printed letters exactly as a blank one', () => {
    const marks = [0, 1, 2, 3, 0, 3, 2, 1, 1, 1].map((choice, row) => ({
      row,
      choice,
    }));
    const opts = { marker, questionCount: 10, choiceCount: 4, marks };
    const plain = readPaperPage(paintSyntheticSheet(opts), {
      questionCount: 10,
      choiceCount: 4,
    });
    const lettered = readPaperPage(
      paintSyntheticSheet({ ...opts, printedLetters: true }),
      { questionCount: 10, choiceCount: 4 }
    );
    // Binarisation drops the letter before sampling, so this is equality, not
    // a tolerance: the printed letter is invisible to the reader.
    expect(ok(lettered).rows).toEqual(ok(plain).rows);
    expect(ok(lettered).rows.map((r) => r.choice)).toEqual(
      marks.map((m) => m.choice)
    );
  });

  it('leaves a lettered but unanswered row blank, with no ink counted', () => {
    const page = paintSyntheticSheet({
      marker,
      questionCount: 50,
      choiceCount: 5,
      printedLetters: true,
    });
    const read = ok(readPaperPage(page, { questionCount: 50, choiceCount: 5 }));
    expect(read.rows.every((r) => r.choice === null && !r.doubt)).toBe(true);
    const worst = Math.max(...read.rows.flatMap((r) => r.fills));
    expect(worst).toBe(0);
  });

  it('would misread the row if the printed letter were darker than the floor', () => {
    const page = paintSyntheticSheet({
      marker,
      questionCount: 10,
      choiceCount: 4,
      printedLetters: true,
      letterGrey: 0x40,
    });
    const read = ok(readPaperPage(page, { questionCount: 10, choiceCount: 4 }));
    // Guards the test above from passing for the wrong reason: the sampler does
    // see in-bubble ink, so the grey is what buys the margin.
    expect(read.rows.some((r) => r.doubt === 'multiple')).toBe(true);
  });

  it('keeps the printed letter grey at or above the safety floor', () => {
    expect(BUBBLE_LETTER_GREY).toBeGreaterThanOrEqual(MIN_BUBBLE_LETTER_GREY);
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
  // Vectors below are fill ratios read from the first real 1-bit scan.
  it('judges a mark against its row rather than an absolute fill', () => {
    expect(classifyRow([0.62, 0, 0, 0])).toEqual({ choice: 0 });
    expect(classifyRow([0, 0, 0.42, 0])).toEqual({ choice: 2 });
    expect(classifyRow([0, 0.15, 0, 0])).toEqual({ choice: 1 });
    expect(classifyRow([0, 0, 0, 0])).toEqual({ choice: null });
  });

  it('flags two comparable marks as multiple', () => {
    expect(classifyRow([0, 0.82, 0, 0.86])).toMatchObject({
      doubt: 'multiple',
    });
    expect(classifyRow([0, 0.22, 0.18, 0])).toMatchObject({
      doubt: 'multiple',
    });
    expect(classifyRow([0.26, 0.34, 0, 0])).toMatchObject({
      doubt: 'multiple',
    });
  });

  it('lets a dark mark win over a light stray one', () => {
    expect(classifyRow([0, 0.23, 0, 0.61])).toEqual({ choice: 3 });
    expect(classifyRow([0.62, 0, 0.34, 0])).toEqual({ choice: 0 });
  });

  it('flags a barely-there mark as unclear', () => {
    expect(classifyRow([0.08, 0, 0, 0])).toEqual({
      choice: null,
      doubt: 'unclear',
    });
    expect(classifyRow([0.03, 0, 0, 0])).toEqual({ choice: null });
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

describe('readPaperPage on a single-column sheet', () => {
  const NARROW = {
    questionCount: 40,
    choiceCount: 4,
    columnsPerPage: 1 as const,
  };
  const marks = [
    { row: 0, choice: 2 },
    { row: 12, choice: 0 },
    { row: 24, choice: 3 },
  ];
  const sheet = (
    extra: Partial<Parameters<typeof paintSyntheticSheet>[0]> = {}
  ) =>
    paintSyntheticSheet({
      marker,
      questionCount: NARROW.questionCount,
      choiceCount: NARROW.choiceCount,
      columnsPerPage: 1,
      printedLetters: true,
      marks,
      ...extra,
    });

  it('reads the 25 rows a single-column page carries', () => {
    const read = ok(readPaperPage(sheet(), NARROW));
    expect(read.rows).toHaveLength(ROWS_PER_COLUMN);
    for (const mark of marks) {
      expect(read.rows[mark.row].choice).toBe(mark.choice);
    }
    expect(read.rows.filter((r) => r.choice !== null)).toHaveLength(
      marks.length
    );
  });

  it('reads the same answers with artwork in the stimulus band', () => {
    const plain = ok(readPaperPage(sheet(), NARROW));
    const withArtwork = ok(
      readPaperPage(
        sheet({
          stimuli: [
            { heightFraction: 0.45, tone: 0x20 },
            { heightFraction: 0.5, tone: 0x80 },
          ],
        }),
        NARROW
      )
    );
    expect(withArtwork.rows).toEqual(plain.rows);
  });

  it('keeps the grey choice letters out of the bubbles under a mid-grey photo', () => {
    // The case that bites: Otsu splits a large mid-grey off from the paper and
    // the cut lands above the letter grey, so every letter reads as a mark.
    const page = sheet({ stimuli: [{ heightFraction: 1, tone: 0xb4 }] });
    const gray = toGrayscale(page);
    const band = {
      x: Math.round((STIMULUS_RECT_MM.x - 6) * 7.87),
      y: Math.round((STIMULUS_RECT_MM.y - 6) * 7.87),
      w: Math.round((STIMULUS_RECT_MM.w + 12) * 7.87),
      h: Math.round((STIMULUS_RECT_MM.h + 12) * 7.87),
    };
    expect(otsuThreshold(gray, page.width, page.height)).toBeGreaterThanOrEqual(
      BUBBLE_LETTER_GREY
    );
    expect(otsuThreshold(gray, page.width, page.height, band)).toBeLessThan(
      BUBBLE_LETTER_GREY
    );

    const read = ok(readPaperPage(page, NARROW));
    expect(read.rows.map((r) => r.choice)).toEqual(
      ok(readPaperPage(sheet(), NARROW)).rows.map((r) => r.choice)
    );
    expect(read.rows.every((r) => r.doubt === undefined)).toBe(true);
  });

  it('excludes the band where the artwork actually landed on a rotated page', () => {
    // The band is only known once the marker says which way up the page was
    // fed; taking it upright would drop the answers and keep the artwork.
    const page = sheet({
      stimuli: [{ heightFraction: 1, tone: 0xb4 }],
      rotated: true,
    });
    const read = ok(readPaperPage(page, NARROW));
    expect(read.rotated).toBe(true);
    for (const mark of marks) {
      expect(read.rows[mark.row].choice).toBe(mark.choice);
    }
    expect(read.rows.filter((r) => r.choice !== null)).toHaveLength(
      marks.length
    );
  });

  it('leaves a two-column read exactly as it was before the band existed', () => {
    const page = paintSyntheticSheet({
      marker,
      questionCount: 50,
      choiceCount: 4,
      printedLetters: true,
      marks,
    });
    const options = { questionCount: 50, choiceCount: 4 };
    expect(ok(readPaperPage(page, { ...options, columnsPerPage: 2 }))).toEqual(
      ok(readPaperPage(page, options))
    );
  });
});
