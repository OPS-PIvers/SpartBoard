import { describe, expect, it } from 'vitest';
import type { PaperBoxSize, PaperGrid, PaperPageMap } from '@/types';
import {
  isStimulusFreePage,
  mcItemsOf,
  planPaperPages,
  questionSlotLines,
  questionSlotsFor,
  writtenItemsOf,
  writtenRectsOf,
  writtenRuleYsMm,
  type PaperSheetEntry,
  type PlanPaperPagesResult,
} from './paperPageMap';
import {
  CORNER_WINDOW_FRACTION,
  FOOTER_RECT_MM,
  HEADER_RECT_MM,
  MARKER_CELL_COUNT,
  MAX_CHOICE_COUNT,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  STIMULUS_RECT_MM,
  bubbleRectAtOriginMm,
  bubbleRectMm,
  cornerWindowsMm,
  markerCellRectMm,
  mcRowOriginMm,
  questionStemRectMm,
  questionsPerPage,
  type RectMm,
} from './paperSheetLayout';
import { MAX_PAGE } from './paperSheetMarker';
import { READER_THRESHOLDS } from './paperSheetReader';
import { PAPER_FULL_PAGE_LINES, paperBoxLines } from './paperWritten';

const overlaps = (a: RectMm, b: RectMm): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const mc = (n: number): PaperSheetEntry => ({
  kind: 'mc',
  questionId: `q${n}`,
  label: String(n),
});
const wr = (n: number, size: PaperBoxSize): PaperSheetEntry => ({
  kind: 'written',
  questionId: `q${n}`,
  label: String(n),
  size,
});

/** Entries numbered 1..n in order; `written` maps a number to its box size. */
const sheet = (
  n: number,
  written: Record<number, PaperBoxSize> = {}
): PaperSheetEntry[] =>
  Array.from({ length: n }, (_, i) =>
    written[i + 1] ? wr(i + 1, written[i + 1]) : mc(i + 1)
  );

const mapsOf = (result: PlanPaperPagesResult): PaperPageMap[] => {
  if (!result.ok) throw new Error(`refused: ${result.pageCount} pages`);
  return result.pageMaps;
};

const plan = (
  entries: PaperSheetEntry[],
  grid: PaperGrid,
  stems = true
): PaperPageMap[] => mapsOf(planPaperPages({ entries, grid, stems }));

const GRIDS: PaperGrid[] = [2, 1, 'questions'];

/** Every bubble and written rect a page prints, for overlap checks. */
const itemRects = (map: PaperPageMap): RectMm[] => [
  ...mcItemsOf(map).flatMap((m) =>
    Array.from({ length: MAX_CHOICE_COUNT }, (_, c) =>
      bubbleRectAtOriginMm(m.originMm, c, map.grid)
    )
  ),
  ...writtenRectsOf(map),
];

const MARKER_RECT: RectMm = (() => {
  const first = markerCellRectMm(0);
  const last = markerCellRectMm(MARKER_CELL_COUNT - 1);
  return {
    x: first.x,
    y: first.y,
    w: last.x + last.w - first.x,
    h: last.y + last.h - first.y,
  };
})();

/** Seeded so a failure reproduces. */
function randomSheet(seed: number): PaperSheetEntry[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const sizes: PaperBoxSize[] = ['S', 'M', 'L', 'full'];
  const n = 1 + Math.floor(rand() * 60);
  return Array.from({ length: n }, (_, i) =>
    rand() < 0.3 ? wr(i + 1, sizes[Math.floor(rand() * 4)]) : mc(i + 1)
  );
}

describe('planPaperPages geometry', () => {
  it('pins the corner windows to the reader', () => {
    expect(CORNER_WINDOW_FRACTION).toBe(
      READER_THRESHOLDS.registrationSearchFraction
    );
  });

  for (const grid of GRIDS) {
    for (const stems of [true, false]) {
      it(`keeps every page clear on grid ${grid}${stems ? '' : ', number-only'}`, () => {
        for (let seed = 1; seed <= 25; seed += 1) {
          const entries = randomSheet(seed);
          const maps = plan(entries, grid, stems);
          const placed = maps.flatMap((m) => m.items.map((i) => i.questionId));
          // Every entry placed exactly once, in test order.
          expect(placed).toEqual(entries.map((e) => e.questionId));
          maps.forEach((map, index) => {
            expect(map.page).toBe(index + 1);
            expect(map.grid).toBe(grid);
            const rects = itemRects(map);
            const clash: string[] = [];
            const forbidden: [string, RectMm][] = [
              ...cornerWindowsMm().map((w, n): [string, RectMm] => [
                `corner ${n}`,
                w,
              ]),
              ['header', HEADER_RECT_MM],
              ['footer', FOOTER_RECT_MM],
              ['marker', MARKER_RECT],
              ...(grid === 1 && !isStimulusFreePage(map)
                ? [['stimulus', STIMULUS_RECT_MM] as [string, RectMm]]
                : []),
            ];
            rects.forEach((r, a) => {
              if (
                r.x < 0 ||
                r.x + r.w > PAGE_WIDTH_MM ||
                r.y + r.h > PAGE_HEIGHT_MM
              )
                clash.push(`off page ${JSON.stringify(r)}`);
              for (const [name, f] of forbidden)
                if (overlaps(r, f)) clash.push(`${name} ${JSON.stringify(r)}`);
              for (let b = a + 1; b < rects.length; b += 1)
                if (overlaps(r, rects[b]))
                  clash.push(`overlap ${JSON.stringify([r, rects[b]])}`);
            });
            expect(clash).toEqual([]);
            for (const w of writtenItemsOf(map)) {
              // The header sits directly above its box, and the box is ruled throughout.
              expect(w.headerMm.y + w.headerMm.h).toBeLessThanOrEqual(
                w.boxMm.y
              );
              expect(w.boxMm.h).toBe(w.lines * 8);
              expect(writtenRuleYsMm(w).at(-1)).toBe(w.boxMm.y + w.boxMm.h);
            }
          });
        }
      });
    }
  }

  it('numbers MC rows 0..n-1 across the sheet, in order', () => {
    for (const grid of GRIDS) {
      const maps = plan(sheet(40, { 3: 'S', 9: 'M', 20: 'L' }), grid);
      const rows = maps.flatMap(mcItemsOf).map((m) => m.sheetRow);
      expect(rows).toEqual(Array.from({ length: 37 }, (_, i) => i));
    }
  });
});

describe('planPaperPages packing', () => {
  it('matches the arithmetic layout when nothing is written', () => {
    for (const grid of GRIDS) {
      const perPage = questionsPerPage(grid);
      const maps = plan(sheet(perPage * 2 + 3), grid);
      expect(maps).toHaveLength(3);
      maps.flatMap(mcItemsOf).forEach((item) => {
        const k = item.sheetRow;
        expect(item.label).toBe(String(k + 1));
        const page = Math.floor(k / perPage) + 1;
        expect(maps[page - 1].items).toContain(item);
        const index = k % perPage;
        expect(item.originMm).toEqual(mcRowOriginMm(index, grid));
        for (let c = 0; c < MAX_CHOICE_COUNT; c += 1) {
          expect(bubbleRectAtOriginMm(item.originMm, c, grid)).toEqual(
            bubbleRectMm(index, c, grid)
          );
        }
      });
    }
  });

  it('plans one empty page for an empty sheet', () => {
    expect(plan([], 2)).toEqual([{ page: 1, grid: 2, items: [] }]);
  });

  it('skips written numbers in the bubble labels', () => {
    const maps = plan(sheet(9, { 7: 'S' }), 2);
    expect(mcItemsOf(maps[0]).map((m) => m.label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '8',
      '9',
    ]);
    expect(writtenItemsOf(maps[0]).map((w) => w.label)).toEqual(['7']);
  });

  it('splits a run before a box into balanced columns, then puts the box below', () => {
    const [page] = plan(sheet(7, { 7: 'M' }), 2);
    const rows = mcItemsOf(page);
    expect(rows.map((r) => r.originMm.x)).toEqual([24, 24, 24, 116, 116, 116]);
    expect(rows.map((r) => r.originMm.y)).toEqual([58, 66, 74, 58, 66, 74]);
    const [box] = writtenItemsOf(page);
    expect(box.headerMm.y).toBe(82);
    expect(box.lines).toBe(paperBoxLines('M'));
  });

  it('starts both columns below a box for the run after it', () => {
    const [page] = plan(sheet(4, { 1: 'S' }), 2, false);
    const [box] = writtenItemsOf(page);
    const rows = mcItemsOf(page);
    const below = box.boxMm.y + box.boxMm.h;
    for (const r of rows) expect(r.originMm.y).toBeGreaterThan(below);
    expect(rows[0].originMm.y).toBe(58 + (1 + 3) * 8);
  });

  it('never splits a box: one that does not fit starts the next page', () => {
    // 45 rows fill rows 0..22 of a two-column page; an L box needs 14.
    const maps = plan(sheet(46, { 46: 'L' }), 2);
    expect(maps).toHaveLength(2);
    expect(writtenItemsOf(maps[0])).toHaveLength(0);
    const [box] = writtenItemsOf(maps[1]);
    expect(box.headerMm.y).toBe(58);
  });

  it('continues a long run across pages without splitting the box after it', () => {
    const maps = plan(sheet(61, { 61: 'M' }), 2);
    expect(mcItemsOf(maps[0])).toHaveLength(50);
    expect(mcItemsOf(maps[1])).toHaveLength(10);
    // Tail of 10 before a box: five rows a column.
    expect(mcItemsOf(maps[1]).filter((r) => r.originMm.x === 24)).toHaveLength(
      5
    );
    expect(writtenItemsOf(maps[1])[0].headerMm.y).toBe(58 + 5 * 8);
  });

  it('gives a Full box its own page, with nothing after it on that page', () => {
    for (const grid of GRIDS) {
      const maps = plan(sheet(5, { 3: 'full' }), grid);
      expect(maps).toHaveLength(3);
      expect(maps[1].items).toHaveLength(1);
      const [full] = writtenItemsOf(maps[1]);
      expect(full.questionId).toBe('q3');
      expect(full.lines).toBe(PAPER_FULL_PAGE_LINES);
      expect(isStimulusFreePage(maps[1])).toBe(true);
      expect(mcItemsOf(maps[2]).map((m) => m.label)).toEqual(['4', '5']);
    }
  });

  it('keeps boxes in the left column on stimulus sheets, and promotes L to its own page', () => {
    const maps = plan(sheet(4, { 2: 'M', 4: 'L' }), 1);
    const [m] = writtenItemsOf(maps[0]);
    expect(m.boxMm.x + m.boxMm.w).toBeLessThan(STIMULUS_RECT_MM.x);
    expect(isStimulusFreePage(maps[0])).toBe(false);
    expect(maps).toHaveLength(2);
    expect(isStimulusFreePage(maps[1])).toBe(true);
    expect(writtenItemsOf(maps[1])[0].lines).toBe(paperBoxLines('L'));
  });

  it('pushes a stimulus-sheet box past the bottom corner window onto the next page', () => {
    // 16 rows leave 9, enough rows for a header and 6 lines but not above the corner window.
    const maps = plan(sheet(17, { 17: 'M' }), 1);
    expect(maps).toHaveLength(2);
    expect(writtenItemsOf(maps[1])[0].headerMm.y).toBe(58);
  });

  it('fills whole question-text slots with ruled lines', () => {
    expect([1, 2, 3].map(questionSlotLines)).toEqual([3, 8, 13]);
    expect(questionSlotsFor('S')).toBe(1);
    expect(questionSlotsFor('M')).toBe(2);
    expect(questionSlotsFor('L')).toBe(3);
    const [page, next] = plan(sheet(4, { 2: 'M', 4: 'L' }), 'questions');
    const [m] = writtenItemsOf(page);
    expect(m.headerMm).toMatchObject({ y: questionStemRectMm(1).y });
    expect(mcItemsOf(page).map((r) => r.originMm)).toEqual([
      mcRowOriginMm(0, 'questions'),
      mcRowOriginMm(3, 'questions'),
    ]);
    // An L box needs three slots and only one is left.
    expect(writtenItemsOf(next)[0].headerMm.y).toBe(questionStemRectMm(0).y);
  });

  it('refuses a sheet past the marker page limit', () => {
    const fits = planPaperPages({
      entries: sheet(
        MAX_PAGE,
        Object.fromEntries(
          Array.from({ length: MAX_PAGE }, (_, i) => [i + 1, 'full' as const])
        )
      ),
      grid: 2,
      stems: true,
    });
    expect(fits.ok).toBe(true);
    const tooMany = planPaperPages({
      entries: sheet(
        MAX_PAGE + 1,
        Object.fromEntries(
          Array.from({ length: MAX_PAGE + 1 }, (_, i) => [
            i + 1,
            'full' as const,
          ])
        )
      ),
      grid: 2,
      stems: true,
    });
    expect(tooMany).toEqual({
      ok: false,
      reason: 'too-many-pages',
      pageCount: MAX_PAGE + 1,
    });
  });
});
