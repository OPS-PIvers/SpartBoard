import { describe, expect, it } from 'vitest';
import type { PaperPageMap } from '@/types';
import {
  planPaperPages,
  writtenItemsOf,
  type PaperSheetEntry,
} from './paperPageMap';
import {
  MARKER_CELL_COUNT,
  markerCellRectMm,
  type RectMm,
} from './paperSheetLayout';
import { decodePaperMarker } from './paperSheetMarker';
import type { PaperSheetPlan } from './paperSheetPlan';
import { buildPaperSheetsHtml, type PaperPrintJob } from './paperSheetPrint';

const sheet = (over: Partial<PaperSheetPlan> = {}): PaperSheetPlan => ({
  seat: 3,
  student: { rosterId: 'r1', studentId: 's1' },
  displayName: 'Alvarez, Sam',
  className: 'Period 1',
  isKeySheet: false,
  ...over,
});

const mc = (n: number): PaperSheetEntry => ({
  kind: 'mc',
  questionId: `q${n}`,
  label: String(n),
});
const wr = (
  n: number,
  size: 'S' | 'M' | 'L' | 'full' = 'M'
): PaperSheetEntry => ({
  kind: 'written',
  questionId: `q${n}`,
  label: String(n),
  size,
});

const mapsFor = (
  entries: PaperSheetEntry[],
  grid: PaperPageMap['grid'] = 2,
  stems = true
): PaperPageMap[] => {
  const plan = planPaperPages({ entries, grid, stems });
  if (!plan.ok) throw new Error('plan refused');
  return plan.pageMaps;
};

const mixed = [mc(1), mc(2), mc(3), wr(4), mc(5), mc(6), wr(7, 'S'), mc(8)];

const job = (
  pageMaps: PaperPageMap[],
  over: Partial<PaperPrintJob> = {}
): PaperPrintJob => ({
  batchId: 'batch-1',
  quizTitle: 'Unit 3 Test',
  questionCount: pageMaps.flatMap((m) => m.items).filter((i) => i.kind === 'mc')
    .length,
  choiceCount: 4,
  sheets: [sheet()],
  pageMaps,
  writtenTexts: { q4: 'Explain photosynthesis.', q7: 'Name a gas.' },
  ...over,
});

const pages = (html: string): string[] =>
  html.split('<div class="sheet">').slice(1);

const readMarker = (pageHtml: string): boolean[] => {
  const inked = new Set(
    [
      ...pageHtml.matchAll(
        /<div class="cell" style="left:([\d.]+)mm;top:([\d.]+)mm/g
      ),
    ].map((m) => `${m[1]},${m[2]}`)
  );
  return Array.from({ length: MARKER_CELL_COUNT }, (_, i) => {
    const r = markerCellRectMm(i);
    return inked.has(`${r.x.toFixed(3)},${r.y.toFixed(3)}`);
  });
};

/** Every absolutely positioned div a page draws, with its class and rect. */
const drawn = (pageHtml: string) =>
  [
    ...pageHtml.matchAll(
      /<div class="([^"]+)" style="left:([\d.]+)mm;top:([\d.]+)mm;width:([\d.]+)mm(?:;height:([\d.]+)mm)?/g
    ),
  ].map((m) => ({
    cls: m[1],
    rect: {
      x: Number(m[2]),
      y: Number(m[3]),
      w: Number(m[4]),
      h: m[5] === undefined ? 0 : Number(m[5]),
    },
  }));

const intersects = (a: RectMm, b: RectMm): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const numbers = (pageHtml: string): string[] =>
  [...pageHtml.matchAll(/<div class="num[^"]*"[^>]*>([^<]*)<\/div>/g)].map(
    (m) => m[1]
  );

describe('buildPaperSheetsHtml with page maps', () => {
  it('flags every page to be read by the map', () => {
    const maps = mapsFor([...mixed, wr(9, 'full')]);
    const html = buildPaperSheetsHtml(job(maps));
    const printed = pages(html);
    expect(printed).toHaveLength(maps.length);
    printed.forEach((p, i) => {
      expect(decodePaperMarker(readMarker(p))).toMatchObject({
        seat: 3,
        page: i + 1,
        isKeySheet: false,
        readByMap: true,
      });
      expect(p).toContain(`Page ${i + 1} of ${maps.length}`);
    });
  });

  it('numbers every question by its place in the quiz, skipping written ones in the bubble rows', () => {
    const html = buildPaperSheetsHtml(job(mapsFor(mixed)));
    expect(numbers(html)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(html).toContain('Explain photosynthesis.');
  });

  it('prints only ruled lines inside a box, one per line', () => {
    const maps = mapsFor(mixed);
    const page = pages(buildPaperSheetsHtml(job(maps)))[0];
    const shapes = drawn(page);
    for (const item of writtenItemsOf(maps[0])) {
      const inside = shapes.filter((d) => intersects(d.rect, item.boxMm));
      expect(inside.length).toBe(item.lines);
      expect(inside.every((d) => d.cls === 'wr-rule')).toBe(true);
    }
  });

  it('prints the number only on a stub header', () => {
    const html = buildPaperSheetsHtml(
      job(mapsFor(mixed, 2, false), { writtenTexts: undefined })
    );
    expect(html).not.toContain('wr-stem');
    expect(numbers(html)).toContain('4');
  });

  it('shades each box on the answer key instead of ruling it', () => {
    const maps = mapsFor(mixed);
    const page = pages(
      buildPaperSheetsHtml(
        job(maps, {
          sheets: [sheet({ isKeySheet: true, displayName: 'ANSWER KEY' })],
        })
      )
    )[0];
    expect(decodePaperMarker(readMarker(page))).toMatchObject({
      isKeySheet: true,
      readByMap: true,
    });
    expect(page).not.toContain('wr-rule');
    expect(page.match(/class="wr-key"/g)).toHaveLength(2);
    expect(page).toContain('Graded by teacher');
  });

  it('leaves the stimulus off a page a full-width box owns', () => {
    const maps = mapsFor([mc(1), wr(2, 'L'), mc(3)], 1);
    const html = buildPaperSheetsHtml(
      job(maps, {
        columnsPerPage: 1,
        sheetStimuli: [
          { id: 's1', label: 'Map', source: 'image', driveFileId: 'f' },
        ],
        stimulusImageSrc: { s1: 'blob:map' },
      })
    );
    const printed = pages(html);
    expect(printed).toHaveLength(3);
    expect(printed[0]).toContain('blob:map');
    expect(printed[1]).not.toContain('blob:map');
    expect(printed[2]).toContain('blob:map');
  });

  it('draws a sheet with no written boxes exactly where the arithmetic layout does', () => {
    const entries = Array.from({ length: 60 }, (_, i) => mc(i + 1));
    for (const grid of [1, 2, 'questions'] as const) {
      const byMap = buildPaperSheetsHtml(
        job(mapsFor(entries, grid), { columnsPerPage: grid })
      );
      const byArithmetic = buildPaperSheetsHtml(
        job(mapsFor(entries, grid), {
          columnsPerPage: grid,
          pageMaps: undefined,
        })
      );
      const shapes = (html: string) =>
        drawn(html)
          .filter((d) => d.cls !== 'cell')
          .map((d) => `${d.cls}@${d.rect.x},${d.rect.y}`);
      expect(shapes(byMap)).toEqual(shapes(byArithmetic));
    }
  });

  it.each([
    ['two-column', 2],
    ['one-column', 1],
    ['question-text', 'questions'],
  ] as const)('renders a mixed %s sheet', (_, grid) => {
    const html = buildPaperSheetsHtml(
      job(mapsFor(mixed, grid), {
        columnsPerPage: grid,
        ...(grid === 'questions'
          ? {
              questionTexts: [1, 2, 3, 5, 6, 8].map((n) => ({
                text: `Question ${n}`,
                choices: ['Red', 'Blue', 'Green', 'Pink'],
              })),
            }
          : {}),
      })
    );
    expect(html).toMatchSnapshot();
  });
});
