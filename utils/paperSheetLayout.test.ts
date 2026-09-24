import { describe, expect, it } from 'vitest';
import {
  BUBBLE_DIAMETER_MM,
  FOOTER_RECT_MM,
  HEADER_RECT_MM,
  MARKER_CELL_COUNT,
  MAX_CHOICE_COUNT,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  QUESTIONS_PER_PAGE,
  REGISTRATION_MARK_CENTERS_MM,
  REGISTRATION_MARK_SIZE_MM,
  ROWS_PER_COLUMN,
  STIMULUS_RECT_MM,
  bubbleRectMm,
  markerCellRectMm,
  pageCountForQuestions,
  questionRowRectMm,
  questionSlotOnPage,
  questionChoiceTextRectMm,
  questionStemRectMm,
  questionsPerPage,
  type PaperGrid,
  type RectMm,
} from './paperSheetLayout';
import { READER_THRESHOLDS } from './paperSheetReader';

const overlaps = (a: RectMm, b: RectMm): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const onPage = (r: RectMm): boolean =>
  r.x >= 0 &&
  r.y >= 0 &&
  r.x + r.w <= PAGE_WIDTH_MM &&
  r.y + r.h <= PAGE_HEIGHT_MM;

const allBubbles = (columns: PaperGrid = 2): RectMm[] => {
  const rects: RectMm[] = [];
  for (let q = 0; q < questionsPerPage(columns); q += 1) {
    for (let c = 0; c < MAX_CHOICE_COUNT; c += 1)
      rects.push(bubbleRectMm(q, c, columns));
  }
  return rects;
};

const registrationRects = (): RectMm[] =>
  REGISTRATION_MARK_CENTERS_MM.map((c) => ({
    x: c.x - REGISTRATION_MARK_SIZE_MM / 2,
    y: c.y - REGISTRATION_MARK_SIZE_MM / 2,
    w: REGISTRATION_MARK_SIZE_MM,
    h: REGISTRATION_MARK_SIZE_MM,
  }));

describe('paperSheetLayout', () => {
  it('keeps every bubble inside the printable page', () => {
    for (const r of allBubbles()) expect(onPage(r)).toBe(true);
  });

  it('keeps every marker cell and registration mark inside the page', () => {
    for (let i = 0; i < MARKER_CELL_COUNT; i += 1) {
      expect(onPage(markerCellRectMm(i))).toBe(true);
    }
    for (const r of registrationRects()) expect(onPage(r)).toBe(true);
  });

  it('never lets two bubbles touch', () => {
    const rects = allBubbles();
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(overlaps(rects[i], rects[j])).toBe(false);
      }
    }
  });

  it('keeps the marker clear of the bubbles and the corner marks', () => {
    const marks = registrationRects();
    for (let i = 0; i < MARKER_CELL_COUNT; i += 1) {
      const cell = markerCellRectMm(i);
      for (const bubble of allBubbles())
        expect(overlaps(cell, bubble)).toBe(false);
      for (const mark of marks) expect(overlaps(cell, mark)).toBe(false);
    }
  });

  it('keeps the corner marks clear of the bubbles', () => {
    for (const mark of registrationRects()) {
      for (const bubble of allBubbles())
        expect(overlaps(mark, bubble)).toBe(false);
    }
  });

  it('fills each column top to bottom before starting the next', () => {
    expect(questionSlotOnPage(0)).toEqual({ column: 0, row: 0 });
    expect(questionSlotOnPage(24)).toEqual({ column: 0, row: 24 });
    expect(questionSlotOnPage(25)).toEqual({ column: 1, row: 0 });
    expect(questionSlotOnPage(49)).toEqual({ column: 1, row: 24 });
  });

  it('rejects positions the printer could not draw', () => {
    expect(() => questionSlotOnPage(QUESTIONS_PER_PAGE)).toThrow(RangeError);
    expect(() => questionSlotOnPage(-1)).toThrow(RangeError);
    expect(() => bubbleRectMm(0, MAX_CHOICE_COUNT)).toThrow(RangeError);
    expect(() => markerCellRectMm(MARKER_CELL_COUNT)).toThrow(RangeError);
  });

  it('crops a row around exactly the bubbles that were printed', () => {
    const row = questionRowRectMm(0, 3);
    const third = bubbleRectMm(0, 2);
    expect(row.x + row.w).toBeCloseTo(third.x + third.w, 6);
    expect(row.h).toBe(BUBBLE_DIAMETER_MM);
    expect(row.x).toBeLessThan(bubbleRectMm(0, 0).x);
  });

  it('clamps a row crop to the printable choice range', () => {
    expect(questionRowRectMm(0, 99)).toEqual(
      questionRowRectMm(0, MAX_CHOICE_COUNT)
    );
    expect(questionRowRectMm(0, 0)).toEqual(questionRowRectMm(0, 2));
  });

  it('paginates on the fixed per-page capacity', () => {
    expect(pageCountForQuestions(0)).toBe(1);
    expect(pageCountForQuestions(1)).toBe(1);
    expect(pageCountForQuestions(QUESTIONS_PER_PAGE)).toBe(1);
    expect(pageCountForQuestions(QUESTIONS_PER_PAGE + 1)).toBe(2);
    expect(pageCountForQuestions(QUESTIONS_PER_PAGE * 3)).toBe(3);
  });
});

describe('paperSheetLayout, single column', () => {
  it('halves the per-page capacity and keeps every row in the left column', () => {
    expect(questionsPerPage(1)).toBe(ROWS_PER_COLUMN);
    for (let q = 0; q < ROWS_PER_COLUMN; q += 1) {
      expect(questionSlotOnPage(q, 1)).toEqual({ column: 0, row: q });
      expect(bubbleRectMm(q, 0, 1)).toEqual(bubbleRectMm(q, 0, 2));
    }
    expect(() => questionSlotOnPage(ROWS_PER_COLUMN, 1)).toThrow(RangeError);
  });

  it('spreads the same test over twice as many pages', () => {
    expect(pageCountForQuestions(ROWS_PER_COLUMN, 1)).toBe(1);
    expect(pageCountForQuestions(ROWS_PER_COLUMN + 1, 1)).toBe(2);
    expect(pageCountForQuestions(40, 1)).toBe(2);
    expect(pageCountForQuestions(40, 2)).toBe(1);
  });

  it('keeps the stimulus band clear of everything the sheet already prints', () => {
    expect(onPage(STIMULUS_RECT_MM)).toBe(true);
    for (const bubble of allBubbles(1)) {
      expect(overlaps(STIMULUS_RECT_MM, bubble)).toBe(false);
    }
    for (const row of Array.from({ length: ROWS_PER_COLUMN }, (_, q) =>
      questionRowRectMm(q, MAX_CHOICE_COUNT, 1)
    )) {
      expect(overlaps(STIMULUS_RECT_MM, row)).toBe(false);
    }
    expect(overlaps(STIMULUS_RECT_MM, HEADER_RECT_MM)).toBe(false);
    expect(overlaps(STIMULUS_RECT_MM, FOOTER_RECT_MM)).toBe(false);
    for (let i = 0; i < MARKER_CELL_COUNT; i += 1) {
      expect(overlaps(STIMULUS_RECT_MM, markerCellRectMm(i))).toBe(false);
    }
  });

  it('keeps the stimulus band out of the windows the reader hunts corners in', () => {
    // A stimulus reaching into a corner window could be picked as a
    // registration mark, and the page would then fail to fit or fit wrong.
    const f = READER_THRESHOLDS.registrationSearchFraction;
    const w = PAGE_WIDTH_MM * f;
    const h = PAGE_HEIGHT_MM * f;
    const windows: RectMm[] = [
      { x: 0, y: 0, w, h },
      { x: PAGE_WIDTH_MM - w, y: 0, w, h },
      { x: 0, y: PAGE_HEIGHT_MM - h, w, h },
      { x: PAGE_WIDTH_MM - w, y: PAGE_HEIGHT_MM - h, w, h },
    ];
    for (const win of windows) {
      expect(overlaps(STIMULUS_RECT_MM, win)).toBe(false);
    }
  });
});

describe('question-text layout', () => {
  const pad = (r: RectMm, by: number): RectMm => ({
    x: r.x - by,
    y: r.y - by,
    w: r.w + by * 2,
    h: r.h + by * 2,
  });
  const perPage = questionsPerPage('questions');
  const slots = Array.from({ length: perPage }, (_, q) => q);
  const stems = slots.map((q) => questionStemRectMm(q));
  const choiceTexts = slots.flatMap((q) =>
    Array.from({ length: MAX_CHOICE_COUNT }, (_, c) =>
      questionChoiceTextRectMm(q, c)
    )
  );
  const texts = [...stems, ...choiceTexts];

  it('fits five questions a page above the footer', () => {
    expect(perPage).toBe(5);
    expect(pageCountForQuestions(30, 'questions')).toBe(6);
    for (const r of [...allBubbles('questions'), ...texts]) {
      expect(onPage(r)).toBe(true);
      expect(overlaps(r, FOOTER_RECT_MM)).toBe(false);
      expect(overlaps(r, HEADER_RECT_MM)).toBe(false);
    }
  });

  it('lists the choices under the stem, one a line, each beside its bubble', () => {
    const bubbles = Array.from({ length: MAX_CHOICE_COUNT }, (_, i) =>
      bubbleRectMm(0, i, 'questions')
    );
    const stem = questionStemRectMm(0);
    expect(bubbles[0].y).toBeGreaterThan(stem.y + stem.h);
    bubbles.forEach((b, i) => {
      expect(b.x).toBe(bubbles[0].x);
      if (i > 0) expect(b.y).toBeGreaterThan(bubbles[i - 1].y);
      const text = questionChoiceTextRectMm(0, i);
      expect(text.x).toBeGreaterThan(b.x + b.w);
      expect(text.y).toBe(b.y);
    });
  });

  it('keeps every bubble clear of all text and of the other bubbles', () => {
    const bubbles = allBubbles('questions');
    for (const bubble of bubbles) {
      for (const text of texts) {
        expect(overlaps(pad(bubble, 1), text)).toBe(false);
      }
    }
    for (let i = 0; i < bubbles.length; i += 1) {
      for (let j = i + 1; j < bubbles.length; j += 1) {
        expect(overlaps(pad(bubbles[i], 0.45), bubbles[j])).toBe(false);
      }
    }
  });

  it('crops a row to its choices without reaching the next question', () => {
    for (const q of slots.slice(0, -1)) {
      const crop = questionRowRectMm(q, MAX_CHOICE_COUNT, 'questions');
      for (let c = 0; c < MAX_CHOICE_COUNT; c += 1) {
        expect(overlaps(crop, bubbleRectMm(q, c, 'questions'))).toBe(true);
        expect(overlaps(crop, bubbleRectMm(q + 1, c, 'questions'))).toBe(false);
      }
      expect(overlaps(crop, questionStemRectMm(q + 1))).toBe(false);
    }
  });

  it('keeps text and bubbles off the marker grid, registration marks and corner windows', () => {
    const f = READER_THRESHOLDS.registrationSearchFraction;
    const w = PAGE_WIDTH_MM * f;
    const h = PAGE_HEIGHT_MM * f;
    const windows: RectMm[] = [
      { x: 0, y: 0, w, h },
      { x: PAGE_WIDTH_MM - w, y: 0, w, h },
      { x: 0, y: PAGE_HEIGHT_MM - h, w, h },
      { x: PAGE_WIDTH_MM - w, y: PAGE_HEIGHT_MM - h, w, h },
    ];
    for (const r of [...texts, ...allBubbles('questions')]) {
      for (const win of windows) expect(overlaps(r, win)).toBe(false);
      for (const reg of registrationRects()) {
        expect(overlaps(r, reg)).toBe(false);
      }
      for (let i = 0; i < MARKER_CELL_COUNT; i += 1) {
        expect(overlaps(r, markerCellRectMm(i))).toBe(false);
      }
    }
  });
});
