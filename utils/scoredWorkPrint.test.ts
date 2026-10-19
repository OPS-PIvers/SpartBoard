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
        PAGE_HEIGHT_MM - CORNER_WINDOW_H_MM + 0.001
      );
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
