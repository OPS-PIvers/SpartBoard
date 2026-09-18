import { describe, expect, it } from 'vitest';
import {
  BUBBLE_DIAMETER_MM,
  MARKER_CELL_COUNT,
  MAX_CHOICE_COUNT,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  QUESTIONS_PER_PAGE,
  REGISTRATION_MARK_CENTERS_MM,
  REGISTRATION_MARK_SIZE_MM,
  bubbleRectMm,
  markerCellRectMm,
  pageCountForQuestions,
  questionRowRectMm,
  questionSlotOnPage,
  type RectMm,
} from './paperSheetLayout';

const overlaps = (a: RectMm, b: RectMm): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const onPage = (r: RectMm): boolean =>
  r.x >= 0 &&
  r.y >= 0 &&
  r.x + r.w <= PAGE_WIDTH_MM &&
  r.y + r.h <= PAGE_HEIGHT_MM;

const allBubbles = (): RectMm[] => {
  const rects: RectMm[] = [];
  for (let q = 0; q < QUESTIONS_PER_PAGE; q += 1) {
    for (let c = 0; c < MAX_CHOICE_COUNT; c += 1)
      rects.push(bubbleRectMm(q, c));
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
