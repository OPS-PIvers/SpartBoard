/**
 * Page layout for the PDF reader (docs/plans/shipped/QUIZ_IMPORT_RELIABILITY.md R2–R4):
 * fragments into lines with column-gap segments, two-column pages read left
 * then right, and running headers and footers dropped. OCR words come through
 * the same code as positioned fragments, so a scanned page reads the same way.
 */

import { matchQuestionOpening } from '@/utils/questionNumbering';
import type { DocSegment } from './types';

/** Fragments within this many points of each other sit on the same line. */
export const LINE_TOLERANCE_PT = 3;
/** A gap wider than this many median glyph widths is a column gap. */
const GAP_GLYPHS = 1.5;
/** Header and footer zones, as a share of the page height. */
const EDGE_ZONE = 0.1;
/** Each column of a two-column page covers at least this share of its text height. */
const COLUMN_SPAN = 0.6;

export interface LayoutItem {
  str: string;
  x: number;
  y: number;
  /** Advance width in points; estimated from the font size when missing. */
  width?: number;
  fontSize?: number;
}

export interface LayoutLine {
  text: string;
  segments: DocSegment[];
  y: number;
}

interface Part {
  str: string;
  x: number;
  xEnd: number;
  glyph: number;
}

interface Row {
  y: number;
  parts: Part[];
}

interface SegmentedRow {
  y: number;
  segments: Array<DocSegment & { x: number; xEnd: number }>;
}

const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

function toPart(item: LayoutItem): Part {
  const chars = Math.max(item.str.length, 1);
  const size = item.fontSize && item.fontSize > 0 ? item.fontSize : 10;
  const width =
    item.width !== undefined && item.width > 0
      ? item.width
      : chars * size * 0.5;
  return {
    str: item.str,
    x: item.x,
    xEnd: item.x + width,
    glyph: width / chars,
  };
}

function groupRows(items: readonly LayoutItem[]): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    if (!item.str) continue;
    const row = rows.find((r) => Math.abs(r.y - item.y) <= LINE_TOLERANCE_PT);
    if (row) row.parts.push(toPart(item));
    else rows.push({ y: item.y, parts: [toPart(item)] });
  }
  // A PDF's y axis runs up the page, so descending y is reading order.
  rows.sort((a, b) => b.y - a.y);
  for (const row of rows) row.parts.sort((a, b) => a.x - b.x);
  return rows;
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Split one row at every gap wider than 1.5× its median glyph width (R2). */
function segmentRow(row: Row): SegmentedRow {
  const printing = row.parts.filter((p) => p.str.trim());
  const glyph = median(printing.map((p) => p.glyph));
  const segments: SegmentedRow['segments'] = [];
  let open: { parts: Part[]; x: number; xEnd: number } | null = null;
  const close = () => {
    if (!open) return;
    const text = tidy(open.parts.map((p) => p.str).join(''));
    if (text) segments.push({ text, x: open.x, xEnd: open.xEnd });
    open = null;
  };
  for (const part of row.parts) {
    if (!part.str.trim()) {
      open?.parts.push(part);
      continue;
    }
    if (open && part.x - open.xEnd > GAP_GLYPHS * glyph) close();
    open ??= { parts: [], x: part.x, xEnd: part.xEnd };
    open.parts.push(part);
    open.xEnd = Math.max(open.xEnd, part.xEnd);
  }
  close();
  return { y: row.y, segments };
}

const toLine = (row: SegmentedRow): LayoutLine => ({
  text: row.segments.map((s) => s.text).join(' '),
  segments: row.segments.map(({ text, x, xEnd }) => ({ text, x, xEnd })),
  y: row.y,
});

/**
 * A two-column page (R4): a vertical gutter no line crosses, with text bands
 * on both sides each spanning most of the page and the right one opening
 * questions. Short option grids never pass, because their right band holds
 * no question openers.
 */
function splitColumns(rows: SegmentedRow[]): SegmentedRow[] | null {
  const segments = rows.flatMap((r) => r.segments);
  if (segments.length < 4) return null;
  const left = Math.min(...segments.map((s) => s.x));
  const right = Math.max(...segments.map((s) => s.xEnd));
  const top = Math.max(...rows.map((r) => r.y));
  const bottom = Math.min(...rows.map((r) => r.y));
  const height = top - bottom;
  if (height <= 0 || right - left <= 0) return null;

  let best: { x: number; crossing: number } | null = null;
  const middle = (left + right) / 2;
  for (
    let x = left + (right - left) * 0.2;
    x <= left + (right - left) * 0.8;
    x += 2
  ) {
    const crossing = rows.filter((r) =>
      r.segments.some((s) => s.x < x && s.xEnd > x)
    ).length;
    if (
      !best ||
      crossing < best.crossing ||
      (crossing === best.crossing &&
        Math.abs(x - middle) < Math.abs(best.x - middle))
    ) {
      best = { x, crossing };
    }
  }
  if (!best) return null;
  const gutter = best.x;

  const crosses = (r: SegmentedRow) =>
    r.segments.some((s) => s.x < gutter && s.xEnd > gutter);
  const sideRows = (keep: (s: SegmentedRow['segments'][number]) => boolean) =>
    rows
      .filter((r) => !crosses(r))
      .map((r) => ({ y: r.y, segments: r.segments.filter(keep) }))
      .filter((r) => r.segments.length > 0);
  const leftRows = sideRows((s) => s.xEnd <= gutter);
  const rightRows = sideRows((s) => s.x >= gutter);
  if (leftRows.length === 0 || rightRows.length === 0) return null;

  const span = (rs: SegmentedRow[]) =>
    Math.max(...rs.map((r) => r.y)) - Math.min(...rs.map((r) => r.y));
  if (span(leftRows) < COLUMN_SPAN * height) return null;
  if (span(rightRows) < COLUMN_SPAN * height) return null;
  if (!rightRows.some((r) => matchQuestionOpening(r.segments[0].text))) {
    return null;
  }

  // Full-width lines (a title, a footer) must sit above or below both columns.
  const bandTop = Math.min(
    Math.max(...leftRows.map((r) => r.y)),
    Math.max(...rightRows.map((r) => r.y))
  );
  const bandBottom = Math.max(
    Math.min(...leftRows.map((r) => r.y)),
    Math.min(...rightRows.map((r) => r.y))
  );
  const spanning = rows.filter(crosses);
  if (spanning.some((r) => r.y < bandTop && r.y > bandBottom)) return null;

  return [
    ...spanning.filter((r) => r.y >= bandTop),
    ...leftRows,
    ...rightRows,
    ...spanning.filter((r) => r.y <= bandBottom),
  ];
}

/** Lines of one page in reading order, with segments. */
export function layoutPage(items: readonly LayoutItem[]): LayoutLine[] {
  const rows = groupRows(items)
    .map(segmentRow)
    .filter((r) => r.segments.length > 0);
  return (splitColumns(rows) ?? rows).map(toLine);
}

export interface PageLines {
  page: number;
  lines: LayoutLine[];
  /** Page height in points, when the reader knows it. */
  height?: number;
}

/** Digits vary between pages ("Page 2 of 5"), so they are folded before comparing. */
const normalize = (text: string): string =>
  text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

const OPTION_LIKE = /^\s*\(?[a-f][.)]\s/i;

/** Lines in the top or bottom tenth of the page, as normalized text. */
function edgeTexts(page: PageLines): Set<string> {
  const ys = page.lines.map((l) => l.y);
  if (ys.length === 0) return new Set();
  const top = page.height ?? Math.max(...ys);
  const bottom = page.height !== undefined ? 0 : Math.min(...ys);
  const zone = (top - bottom) * EDGE_ZONE;
  const texts = new Set<string>();
  for (const line of page.lines) {
    if (line.y < top - zone && line.y > bottom + zone) continue;
    if (OPTION_LIKE.test(line.text) || matchQuestionOpening(line.text)) {
      continue;
    }
    texts.add(normalize(line.text));
  }
  return texts;
}

/**
 * Running headers and footers (R4): a line recurring at the top or bottom of
 * at least half the pages, three at minimum. A two-page document needs it on
 * both pages and a page number or copyright sign to be sure.
 */
export function stripRunningLines(pages: PageLines[]): PageLines[] {
  if (pages.length < 2) return pages;
  const edges = pages.map(edgeTexts);
  const counts = new Map<string, number>();
  for (const set of edges) {
    for (const text of set) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const running = new Set<string>();
  for (const [text, count] of counts) {
    if (pages.length === 2) {
      if (count === 2 && /#|©|\(c\)/.test(text)) running.add(text);
    } else if (count >= Math.max(3, Math.ceil(pages.length / 2))) {
      running.add(text);
    }
  }
  if (running.size === 0) return pages;
  return pages.map((page, i) => ({
    ...page,
    lines: page.lines.filter(
      (l) =>
        !(edges[i].has(normalize(l.text)) && running.has(normalize(l.text)))
    ),
  }));
}

/**
 * Left edges clustered into column bands (R4), so a key reader can keep one
 * table column from bleeding into the next. Returns each band's leftmost x.
 */
export function columnBands(xs: readonly number[], tolerance = 12): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const bands: number[] = [];
  let last = -Infinity;
  for (const x of sorted) {
    if (x - last > tolerance) bands.push(x);
    last = x;
  }
  return bands;
}

/** The band a left edge falls in, by index into `columnBands`' result. */
export function bandOf(bands: readonly number[], x: number): number {
  let index = 0;
  for (let i = 0; i < bands.length; i += 1) {
    if (x >= bands[i] - 1) index = i;
  }
  return index;
}

/** A Tesseract word box, in image pixels with y running down. */
export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLine {
  words: OcrWord[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** One recognized page: Tesseract's lines, the image height, and pixels per point. */
export interface OcrPage {
  lines: OcrLine[];
  height: number;
  scale: number;
}

/** OCR words as positioned fragments in points, one baseline per recognized line (R3). */
export function ocrItems(page: OcrPage): LayoutItem[] {
  const items: LayoutItem[] = [];
  for (const line of page.lines) {
    const y = (page.height - line.bbox.y1) / page.scale;
    for (const word of line.words) {
      if (!word.text.trim()) continue;
      items.push({
        str: `${word.text} `,
        x: word.bbox.x0 / page.scale,
        y,
        width: (word.bbox.x1 - word.bbox.x0) / page.scale,
        fontSize: (word.bbox.y1 - word.bbox.y0) / page.scale,
      });
    }
  }
  return items;
}
