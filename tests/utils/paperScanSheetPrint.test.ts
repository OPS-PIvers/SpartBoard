import { describe, expect, it } from 'vitest';
import { paintSyntheticSheet } from '@/tests/testHelpers/paperSheetRaster';
import {
  SCAN_SAFE_MARGIN_MM,
  buildScanSheetPageHtml,
  scanSheetPatchRectsMm,
  type ScanSheetPageInput,
} from '@/utils/paperScanSheetPrint';
import { readPaperPage } from '@/utils/paperSheetReader';
import { paperBatchTag } from '@/utils/paperSheetMarker';
import {
  BUBBLE_DIAMETER_MM,
  NUMBER_WIDTH_MM,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  QUESTION_CHOICE_LINE_MM,
  bubbleRectAtOriginMm,
} from '@/utils/paperSheetLayout';
import type { SheetFill } from '@/utils/paperSheetPrint';
import { scanMarkup, scanPageMaps } from './fixtures/scanSheetFixture';

const SRC = 'blob:https://spartboard.test/page-1';
const KEPT_PX_PER_MM = 150 / 25.4;

const fillOf = (over: Partial<SheetFill> = {}): SheetFill => ({
  filled: [1, 0, 0, 3, null, 2, 0, 2, 1, 2],
  key: [1, 2, 0, 3, 1, 2, 0, 3, 1, 2],
  marks: [
    'correct',
    'incorrect',
    'correct',
    'correct',
    'incorrect',
    'correct',
    'correct',
    'incorrect',
    'correct',
    'correct',
  ],
  score: 'Score: 12 / 18 (67%)',
  written: {
    w1: { points: '3/4', comment: 'Good start. Say where the energy goes.' },
  },
  ...over,
});

const input = (over: Partial<ScanSheetPageInput> = {}): ScanSheetPageInput => ({
  pageSrc: SRC,
  page: 1,
  geometry: {
    batchId: 'batch-scan',
    seat: 7,
    questionCount: 10,
    choiceCount: 4,
    columnsPerPage: 2,
    pageMap: scanPageMaps()[0],
  },
  fill: fillOf(),
  options: {
    markAnswers: true,
    keyMode: 'all',
    questionScope: 'all',
    showScore: true,
    showWrittenFeedback: true,
  },
  ...over,
});

const glyphCount = (html: string, ink: string) =>
  html.split(`stroke="${ink}" stroke-width`).length - 1;
const CHECK = '#00b832';
const CROSS = '#ff0000';

function paintRect(
  page: { width: number; data: Uint8ClampedArray },
  r: { x: number; y: number; w: number; h: number },
  pxPerMm: number
) {
  for (
    let y = Math.floor(r.y * pxPerMm);
    y < Math.ceil((r.y + r.h) * pxPerMm);
    y += 1
  ) {
    for (
      let x = Math.floor(r.x * pxPerMm);
      x < Math.ceil((r.x + r.w) * pxPerMm);
      x += 1
    ) {
      const o = (y * page.width + x) * 4;
      page.data[o] = 255;
      page.data[o + 1] = 255;
      page.data[o + 2] = 255;
    }
  }
}

describe('scan sheet white patches (K20)', () => {
  const sheet = () =>
    paintSyntheticSheet({
      marker: {
        batchTag: paperBatchTag('batch-scan'),
        seat: 7,
        page: 1,
        isKeySheet: false,
      },
      questionCount: 20,
      choiceCount: 4,
      marks: [
        { row: 0, choice: 1 },
        { row: 3, choice: 2, density: 0.6 },
        { row: 7, choice: 0 },
      ],
      pxPerMm: KEPT_PX_PER_MM,
      noise: 0.0005,
    });

  it('a kept page as stored still reads, so the patches are what stop it', () => {
    const read = readPaperPage(sheet(), { questionCount: 20, choiceCount: 4 });
    expect(read.status).toBe('ok');
  });

  it('a printed kept page with the patches on is refused by the real reader', () => {
    const page = sheet();
    for (const r of scanSheetPatchRectsMm()) paintRect(page, r, KEPT_PX_PER_MM);
    expect(
      readPaperPage(page, { questionCount: 20, choiceCount: 4 }).status
    ).not.toBe('ok');
  });

  it('is refused even when the page was straightened 2 mm off', () => {
    const page = paintSyntheticSheet({
      marker: {
        batchTag: paperBatchTag('batch-scan'),
        seat: 7,
        page: 1,
        isKeySheet: false,
      },
      questionCount: 20,
      choiceCount: 4,
      pxPerMm: KEPT_PX_PER_MM,
      offsetPx: {
        x: Math.round(2 * KEPT_PX_PER_MM),
        y: Math.round(2 * KEPT_PX_PER_MM),
      },
    });
    const shift = 2;
    for (const r of scanSheetPatchRectsMm()) {
      paintRect(page, { ...r, x: r.x + shift, y: r.y + shift }, KEPT_PX_PER_MM);
    }
    expect(
      readPaperPage(page, { questionCount: 20, choiceCount: 4 }).status
    ).not.toBe('ok');
  });
});

describe('buildScanSheetPageHtml', () => {
  it('has no page to print without an image', () => {
    expect(buildScanSheetPageHtml(input({ pageSrc: '' }))).toBeNull();
  });

  it('draws the page, the patches first, then marks and rings, as one sheet section', () => {
    const html = buildScanSheetPageHtml(input()) ?? '';
    expect(
      html.startsWith('<section class="sheet scan-sheet" data-scan-page="1">')
    ).toBe(true);
    expect(html).toContain(`src="${SRC}"`);
    const firstPatch = html.indexOf('fill="#fff"/>');
    expect(firstPatch).toBeGreaterThan(0);
    expect(firstPatch).toBeLessThan(html.indexOf(CHECK));
    // Page 1 of the fixture holds 10 rows: 7 right, 3 wrong.
    expect(glyphCount(html, CHECK)).toBe(7);
    expect(glyphCount(html, CROSS)).toBe(3);
    expect(html.split('<circle').length - 1).toBe(10);
    expect(html).toContain('Score: 12 / 18 (67%)');
    expect(html).toContain('3/4');
    expect(html).toContain('Good start. Say where the energy goes.');
  });

  it('missed only marks just the missed rows and rings just their keys', () => {
    const html =
      buildScanSheetPageHtml(
        input({ options: { ...input().options, questionScope: 'missed' } })
      ) ?? '';
    expect(glyphCount(html, CHECK)).toBe(0);
    expect(glyphCount(html, CROSS)).toBe(3);
    expect(html.split('<circle').length - 1).toBe(3);
  });

  it('missed only still finds missed rows from the key when marks are off', () => {
    const fill = fillOf({ marks: fillOf().marks.map(() => null) });
    const html =
      buildScanSheetPageHtml(
        input({
          fill,
          options: {
            ...input().options,
            markAnswers: false,
            questionScope: 'missed',
          },
        })
      ) ?? '';
    expect(glyphCount(html, CHECK) + glyphCount(html, CROSS)).toBe(0);
    expect(html.split('<circle').length - 1).toBe(3);
  });

  it('prints an unclear row as a question mark even with marking off', () => {
    const marks = fillOf().marks.map((_, i) =>
      i === 4 ? ('unclear' as const) : null
    );
    const html =
      buildScanSheetPageHtml(
        input({ fill: fillOf({ marks, key: marks.map(() => null) }) })
      ) ?? '';
    expect(glyphCount(html, '#000')).toBe(1);
  });

  it('rings the key on a filled and on an empty bubble alike, clear of the bubble and the number', () => {
    const html = buildScanSheetPageHtml(input()) ?? '';
    const map = scanPageMaps()[0];
    const rows = map.items.flatMap((i) => (i.kind === 'mc' ? [i] : []));
    const key = fillOf().key;
    for (const row of rows) {
      const b = bubbleRectAtOriginMm(
        row.originMm,
        key[row.sheetRow] as number,
        2
      );
      const cx = b.x + b.w / 2;
      const m = new RegExp(
        `<circle cx="${cx}" cy="${b.y + b.h / 2}" r="([\\d.]+)" fill="none" stroke="#0066ff" stroke-width="([\\d.]+)"`
      ).exec(html);
      expect(m, `ring on row ${row.label}`).not.toBeNull();
      const r = Number(m?.[1]);
      const w = Number(m?.[2]);
      // Outside the printed bubble and a heavy pencil fill.
      expect(r - w / 2).toBeGreaterThan(BUBBLE_DIAMETER_MM / 2 + 0.4);
      // Never reaches the right-aligned question number left of bubble A.
      expect(cx - r - w / 2).toBeGreaterThan(
        row.originMm.x + NUMBER_WIDTH_MM - 2 + 0.8
      );
    }
  });

  it('keeps the tight ring off the next choice on the question-text grid', () => {
    const html =
      buildScanSheetPageHtml(
        input({
          geometry: {
            ...input().geometry,
            columnsPerPage: 'questions',
            pageMap: undefined,
          },
        })
      ) ?? '';
    const m =
      /<circle cx="[\d.]+" cy="[\d.]+" r="([\d.]+)" fill="none" stroke="#0066ff" stroke-width="([\d.]+)"/.exec(
        html
      );
    expect(m).not.toBeNull();
    const reach = Number(m?.[1]) + Number(m?.[2]) / 2;
    expect(reach).toBeLessThan(
      QUESTION_CHOICE_LINE_MM - BUBBLE_DIAMETER_MM / 2
    );
    expect(html).toContain('fill="#0066ff"/>');
  });

  it('draws markup in page millimetres and lists its numbered comments beside the box', () => {
    const items = scanMarkup();
    const html =
      buildScanSheetPageHtml(
        input({ markup: { w1: { scanId: 'scan-A', page: 1, items } } })
      ) ?? '';
    expect(html).toContain('viewBox="0 0 215.9 279.4"');
    expect(html).toContain('Strong claim.');
    expect(html).toContain('Which gas do plants take in?');
    // Markup draws last, over the marks.
    expect(html.lastIndexOf('<svg')).toBeGreaterThan(html.indexOf('scan-fb'));
  });

  it('cuts a long comment to the room beside its box and points to the report', () => {
    const long = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      kind: 'pin' as const,
      atMm: { x: 60 + i * 5, y: 110 },
      comment: `Comment number ${i} with some words in it`,
    }));
    const html =
      buildScanSheetPageHtml(
        input({
          fill: fillOf({ written: { w1: { points: '3/4', comment: long } } }),
          markup: { w1: { scanId: 'scan-A', page: 1, items } },
          reportFollows: true,
        })
      ) ?? '';
    expect(html).toContain('…');
    expect(html).not.toContain('word299');
    expect(html).toMatch(/\+\d+ more in the report/);
    // The note wraps at 10 pt, so its two lines fit under the cut comments.
    const col =
      /<div class="scan-fb"[^>]*max-height:([\d.]+)mm[^>]*>(.*)<\/div>/.exec(
        html
      );
    const cap = Number(col?.[1]);
    const used = [...(col?.[2] ?? '').matchAll(/max-height:([\d.]+)mm/g)]
      .map((m) => Number(m[1]))
      .reduce((a, v) => a + v, 0);
    expect(used + 4.8 + 2 * 4.2).toBeLessThanOrEqual(cap);
  });

  it('keeps everything it draws inside the strip any printer can reach', () => {
    const items = scanMarkup();
    const html =
      buildScanSheetPageHtml(
        input({ markup: { w1: { scanId: 'scan-A', page: 1, items } } })
      ) ?? '';
    const marks =
      /<svg class="scan-marks"[^>]*>(.*?)<\/svg>/.exec(html)?.[1] ?? '';
    const lo = SCAN_SAFE_MARGIN_MM;
    const hiX = PAGE_WIDTH_MM - SCAN_SAFE_MARGIN_MM;
    const hiY = PAGE_HEIGHT_MM - SCAN_SAFE_MARGIN_MM;
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    for (const m of marks.matchAll(
      /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g
    )) {
      boxes.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] });
    }
    for (const m of marks.matchAll(
      /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g
    )) {
      boxes.push({
        x: +m[1] - +m[3],
        y: +m[2] - +m[3],
        w: +m[3] * 2,
        h: +m[3] * 2,
      });
    }
    for (const m of marks.matchAll(
      /translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/g
    )) {
      boxes.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[3] });
    }
    for (const m of html.matchAll(
      /class="scan-(?:fb|score)" style="left:([\d.]+)mm;top:([\d.]+)mm;width:([\d.]+)mm(?:;max-height:([\d.]+)mm)?/g
    )) {
      boxes.push({ x: +m[1], y: +m[2], w: +m[3], h: m[4] ? +m[4] : 10 });
    }
    expect(boxes.length).toBeGreaterThan(20);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(lo);
      expect(b.y).toBeGreaterThanOrEqual(lo);
      expect(b.x + b.w).toBeLessThanOrEqual(hiX);
      expect(b.y + b.h).toBeLessThanOrEqual(hiY);
    }
  });

  it('every patch covers its mark with room to spare', () => {
    const [marker, ...corners] = scanSheetPatchRectsMm();
    expect(marker.x).toBeLessThanOrEqual(140 - 2);
    expect(marker.x + marker.w).toBeGreaterThanOrEqual(140 + 14 * 4 + 3 + 2);
    for (const c of corners) expect(c.w).toBeGreaterThanOrEqual(5 + 2 * 2.5);
  });
});
