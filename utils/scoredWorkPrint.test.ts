import { describe, expect, it } from 'vitest';
import {
  CORNER_WINDOW_H_MM,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
} from './paperSheetLayout';
import {
  decodePaperMarker,
  encodePaperMarker,
  paperBatchTag,
} from './paperSheetMarker';
import {
  SCORED_WORK_BODY_MM,
  buildScoredWorkHtml,
  fitWorksheetPage,
  placeWorksheet,
  openPrintWindow,
} from './scoredWorkPrint';

const sheets = [
  { seat: 1, student: null, displayName: 'Lee, <Ann>', className: 'P1' },
  { seat: 2, student: null, displayName: 'Kim, Bo', className: 'P1' },
];

describe('scoredWorkPrint', () => {
  it('prints one stamped page per student per worksheet page', () => {
    const html = buildScoredWorkHtml(
      {
        workId: 'w1',
        title: 'Essay',
        pageCount: 2,
        sheets,
        pageImageSrc: ['a', 'b'],
      },
      [0.77, 0.77]
    );
    expect(html.match(/class="sheet"/g)).toHaveLength(4);
    expect(html.match(/class="reg"/g)).toHaveLength(16);
    expect(html).toContain('Lee, &lt;Ann&gt;');
    expect(html).toContain('Page 2 of 2');
  });

  it('draws the same cell count the marker encodes', () => {
    const html = buildScoredWorkHtml({
      workId: 'w1',
      title: 'E',
      pageCount: 1,
      sheets: [sheets[0]],
      pageImageSrc: [],
    });
    const bits = encodePaperMarker({
      batchTag: paperBatchTag('w1'),
      seat: 1,
      page: 1,
      isKeySheet: false,
    });
    expect(html.match(/class="cell"/g)).toHaveLength(
      bits.filter(Boolean).length
    );
    expect(decodePaperMarker(bits)?.seat).toBe(1);
  });

  it('keeps the worksheet inside the free band for any aspect', () => {
    for (const aspect of [0.4, 0.77, 1, 1.6]) {
      const r = fitWorksheetPage(aspect);
      expect(r.x).toBeGreaterThanOrEqual(SCORED_WORK_BODY_MM.x - 0.001);
      expect(r.x + r.w).toBeLessThanOrEqual(
        PAGE_WIDTH_MM - SCORED_WORK_BODY_MM.x + 0.001
      );
      expect(r.y + r.h).toBeLessThanOrEqual(
        SCORED_WORK_BODY_MM.y + SCORED_WORK_BODY_MM.h + 0.001
      );
      expect(r.y + r.h).toBeLessThan(PAGE_HEIGHT_MM - CORNER_WINDOW_H_MM + 15);
    }
  });
});

describe('openPrintWindow', () => {
  it('opens a window right away and says it is preparing', () => {
    const written: string[] = [];
    const win = { document: { write: (h: string) => written.push(h) } };
    const opened = openPrintWindow(() => win as unknown as Window);
    expect(opened).toBe(win);
    expect(written.join('')).toContain('Preparing');
  });

  it('explains a blocked pop-up', () => {
    expect(() => openPrintWindow(() => null)).toThrow(/allow pop-ups/);
  });
});

describe('placeWorksheet', () => {
  it('turns a wide worksheet sideways on Best fit, and leaves a tall one upright', () => {
    expect(placeWorksheet(1.29, 'auto').rotated).toBe(true);
    expect(placeWorksheet(0.77, 'auto').rotated).toBe(false);
  });

  it('obeys an explicit choice', () => {
    expect(placeWorksheet(0.77, 'sideways').rotated).toBe(true);
    expect(placeWorksheet(1.29, 'upright').rotated).toBe(false);
  });

  it('prints a trimmed worksheet larger than a full letter page', () => {
    // Scale of the printed content against its original size, for a letter page and the same page cropped to its text.
    const fullPage =
      fitWorksheetPage(PAGE_WIDTH_MM / PAGE_HEIGHT_MM).w / PAGE_WIDTH_MM;
    const trimmed = fitWorksheetPage(165 / 229).w / 165;
    expect(trimmed).toBeGreaterThan(fullPage * 1.15);
  });

  it('draws a turned worksheet with a quarter turn about its own box', () => {
    const html = buildScoredWorkHtml(
      {
        workId: 'w',
        title: 'T',
        pageCount: 1,
        sheets: [sheets[0]],
        pageImageSrc: ['x'],
        orientation: 'sideways',
      },
      [1.29]
    );
    expect(html).toContain('rotate(90deg)');
  });
});
