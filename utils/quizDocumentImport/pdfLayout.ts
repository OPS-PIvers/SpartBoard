/**
 * Page layout for the PDF reader (docs/plans/shipped/QUIZ_IMPORT_RELIABILITY.md R2–R4):
 * fragments into lines with column-gap segments, two-column pages read left
 * then right, and running headers and footers dropped. OCR words come through
 * the same code as positioned fragments, so a scanned page reads the same way.
 */

import { matchQuestionOpening } from '@/utils/questionNumbering';
import { fraction, isScriptRun, toScript } from './mathText';
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
  /** Set in a bold font. */
  bold?: boolean;
}

export interface LayoutLine {
  text: string;
  segments: DocSegment[];
  y: number;
  /** The line's font size in points. */
  size?: number;
}

interface Part {
  str: string;
  x: number;
  xEnd: number;
  glyph: number;
  y: number;
  size: number;
  /** Taken in from a baseline just above or below the line's own. */
  raised?: boolean;
  bold?: boolean;
}

interface Row {
  y: number;
  parts: Part[];
}

/** A raised or lowered fragment joins the line within this share of its font size. */
const RAISED_REACH = 0.5;
/** Digits this much smaller than the line, off its baseline, are a subscript or superscript. */
const SCRIPT_SIZE = 0.8;
const SCRIPT_DIGITS = /^(?=.*\d)[\d+\-−]+$/;

/** Equation-editor letters (𝑝𝑒𝑟…) as the plain letters they stand for. */
const plainLetters = (s: string): string =>
  s.replace(/[\u{1D400}-\u{1D7FF}]/gu, (c) => c.normalize('NFKC'));

interface SegmentedRow {
  y: number;
  size?: number;
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
    str: plainLetters(item.str),
    x: item.x,
    xEnd: item.x + width,
    glyph: width / chars,
    y: item.y,
    size,
    ...(item.bold ? { bold: true } : {}),
  };
}

/** A choice's own letter, like `b.` or `(B)`, when it is a fragment by itself. */
const CHOICE_MARKER = /^\(?[A-Ha-h][.)]$/;

/** Bold the way a teacher marks an answer: its letter, or most of its words. */
function isMarkedBold(parts: readonly Part[]): boolean {
  const shown = parts.filter((p) => p.str.trim());
  if (shown.length === 0) return false;
  const [first, ...rest] = shown;
  const marker = CHOICE_MARKER.test(first.str.trim());
  if (marker && first.bold) return true;
  const letters = (p: Part) => p.str.replace(/[^\p{L}\p{N}]/gu, '').length;
  const body = marker ? rest : shown;
  const all = body.reduce((sum, p) => sum + letters(p), 0);
  const bold = body.reduce((sum, p) => sum + (p.bold ? letters(p) : 0), 0);
  return all > 0 && bold * 2 >= all;
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const printing = (row: Row): Part[] => row.parts.filter((p) => p.str.trim());
/** The line's own font size; a fragment taken in from another baseline doesn't set it. */
const rowSize = (row: Row): number =>
  Math.max(
    0,
    ...printing(row)
      .filter((p) => !p.raised)
      .map((p) => p.size)
  );
const rowWidth = (row: Row): number =>
  printing(row).reduce((sum, p) => sum + (p.xEnd - p.x), 0);

/** Can `raised` sit in `base`'s line: close above or below it, inside its span, over none of its text? */
function sitsIn(raised: Row, base: Row): boolean {
  const size = rowSize(base);
  // An arrowhead is often set a size up from its line.
  if (size <= 0 || rowSize(raised) > 1.5 * size) return false;
  if (Math.abs(raised.y - base.y) > RAISED_REACH * size) return false;
  if (rowWidth(raised) >= rowWidth(base)) return false;
  const own = printing(raised);
  const theirs = printing(base);
  if (own.length === 0 || theirs.length === 0) return false;
  const reach = 2 * median(theirs.map((p) => p.glyph));
  const left = Math.min(...theirs.map((p) => p.x)) - reach;
  const right = Math.max(...theirs.map((p) => p.xEnd)) + reach;
  return own.every(
    (p) =>
      p.x >= left &&
      p.xEnd <= right &&
      !theirs.some((t) => p.x < t.xEnd - 1 && p.xEnd > t.x + 1)
  );
}

/** A numerator sits at least this share of the font size above its line; an exponent sits lower. */
const NUMERATOR_RISE = 0.4;
/** A denominator sits at least this far below its line; a subscript sits higher. */
const DENOMINATOR_DROP = 0.35;
const FRACTION_REACH = 0.9;
const MAX_FRACTION_CHARS = 24;

interface Cluster {
  row: Row;
  parts: Part[];
  x: number;
  xEnd: number;
  text: string;
  used?: boolean;
}

/** A row's fragments grouped at its column gaps. */
function clustersOf(row: Row): Cluster[] {
  const shown = printing(row).sort((a, b) => a.x - b.x);
  const glyph = median(shown.map((p) => p.glyph));
  const out: Cluster[] = [];
  for (const part of shown) {
    const last = out[out.length - 1];
    if (last && part.x - last.xEnd <= GAP_GLYPHS * glyph) {
      last.text += part.x - last.xEnd > 0.3 * glyph ? ` ${part.str}` : part.str;
      last.parts.push(part);
      last.xEnd = Math.max(last.xEnd, part.xEnd);
    } else {
      out.push({
        row,
        parts: [part],
        x: part.x,
        xEnd: part.xEnd,
        text: part.str,
      });
    }
  }
  return out;
}

/** A stacked fraction, set on baselines above and below its line, is written into the line as `2/3`. */
function absorbFractions(rows: Row[]): Row[] {
  for (const base of rows) {
    const size = rowSize(base);
    const theirs = printing(base);
    if (size <= 0 || theirs.length === 0) continue;
    const baseline = theirs.find((p) => p.size === size)?.y ?? base.y;
    const stacked = (min: number, sign: 1 | -1): Cluster[] =>
      rows
        .filter((row) => {
          const offset = (row.y - baseline) * sign;
          return (
            row !== base &&
            offset >= min * size &&
            offset <= FRACTION_REACH * size
          );
        })
        .flatMap(clustersOf)
        .filter(
          (c) =>
            tidy(c.text).length <= MAX_FRACTION_CHARS &&
            /[\p{L}\p{N}]/u.test(c.text) &&
            !theirs.some((t) => c.x < t.xEnd - 1 && c.xEnd > t.x + 1)
        );
    const tops = stacked(NUMERATOR_RISE, 1);
    const bottoms = tops.length > 0 ? stacked(DENOMINATOR_DROP, -1) : [];
    const left = Math.min(...theirs.map((p) => p.x)) - size;
    const right = Math.max(...theirs.map((p) => p.xEnd)) + 3 * size;
    for (const top of tops) {
      const centre = (c: Cluster) => (c.x + c.xEnd) / 2;
      const width = (c: Cluster) => c.xEnd - c.x;
      const under = bottoms.find(
        (b) =>
          !b.used &&
          Math.abs(centre(b) - centre(top)) <=
            2 + 0.25 * Math.max(width(b), width(top))
      );
      const x = Math.min(top.x, under?.x ?? top.x);
      const xEnd = Math.max(top.xEnd, under?.xEnd ?? top.xEnd);
      if (!under || x < left || xEnd > right) continue;
      under.used = true;
      const str = ` ${fraction(top.text, under.text)} `;
      base.parts.push({
        str,
        x,
        xEnd,
        glyph: (xEnd - x) / str.length,
        y: baseline,
        size,
      });
      for (const c of [top, under]) {
        c.row.parts = c.row.parts.filter((p) => !c.parts.includes(p));
      }
    }
  }
  return rows.filter((row) => printing(row).length > 0);
}

/** A label over an arrow, an exponent or a subscript set on its own baseline joins the line it belongs to. */
function absorbRaised(rows: Row[]): Row[] {
  const baseOf = new Map<Row, Row>();
  for (const row of rows) {
    const bases = rows
      .filter((other) => other !== row && sitsIn(row, other))
      .sort((a, b) => Math.abs(a.y - row.y) - Math.abs(b.y - row.y));
    if (bases[0]) baseOf.set(row, bases[0]);
  }
  const taken = new Map<Row, Part[]>();
  for (const [row, base] of baseOf) {
    // A line that itself joins another can't take one in.
    if (baseOf.has(base)) continue;
    const size = rowSize(base);
    for (const part of row.parts) {
      const text = part.str.trim();
      // A raised letter is an exponent only when it is small and touches the text before it.
      const script =
        SCRIPT_DIGITS.test(text) ||
        (part.size <= SCRIPT_SIZE * size &&
          printing(base).some(
            (t) =>
              part.x >= t.xEnd - 1 && part.x - t.xEnd <= SCRIPT_ABUTS * size
          ));
      const joined: Part = {
        ...part,
        raised: true,
        ...(script ? {} : { str: ` ${part.str} ` }),
      };
      base.parts.push(joined);
      if (!script) taken.set(base, [...(taken.get(base) ?? []), joined]);
    }
    row.parts = [];
  }
  for (const parts of taken.values()) labelArrow(parts);
  return rows.filter((row) => row.parts.length > 0);
}

/** A word set over a line ending in `>` is a labelled arrow: `—enzyme→`. */
function labelArrow(raised: Part[]): void {
  const head = raised.find((p) => /^(?:>|→)$/.test(p.str.trim()));
  if (!head) return;
  const label = raised
    .filter((p) => p !== head && p.str.trim() && p.x < head.xEnd)
    .sort((a, b) => a.x - b.x);
  if (label.length === 0) {
    head.str = ' → ';
    return;
  }
  const words = label.map((p) => p.str.trim()).join(' ');
  label.forEach((p, i) => {
    p.str = i === 0 ? ` —${words}→ ` : '';
  });
  head.str = '';
}

/** How close a raised letter must sit to the text it is an exponent of, as a share of the font size. */
const SCRIPT_ABUTS = 0.25;

/** A part's text, with small digits (or a short term touching the text before it) off the baseline written as ₂ or ². */
function scripted(
  part: Part,
  baseline: number,
  size: number,
  abuts: boolean
): string {
  const text = part.str.trim();
  if (part.size > SCRIPT_SIZE * size) return part.str;
  if (!SCRIPT_DIGITS.test(text) && !(abuts && isScriptRun(text))) {
    return part.str;
  }
  const offset = part.y - baseline;
  const kind = offset <= -1 ? 'sub' : offset >= 1.5 ? 'sup' : null;
  return kind ? part.str.replace(text, toScript(text, kind)) : part.str;
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
  const joined = absorbRaised(absorbFractions(rows));
  for (const row of joined) row.parts.sort((a, b) => a.x - b.x);
  return joined;
}

/** Split one row at every gap wider than 1.5× its median glyph width (R2). */
function segmentRow(row: Row): SegmentedRow {
  const shown = printing(row);
  const glyph = median(shown.map((p) => p.glyph));
  const size = rowSize(row);
  const baseline = shown.find((p) => !p.raised && p.size === size)?.y ?? row.y;
  const segments: SegmentedRow['segments'] = [];
  let open: { parts: Part[]; x: number; xEnd: number } | null = null;
  const close = () => {
    if (!open) return;
    let end: number | null = null;
    const text = tidy(
      open.parts
        .map((p) => {
          const abuts = end !== null && p.x - end <= SCRIPT_ABUTS * size;
          if (p.str.trim()) end = p.xEnd;
          return scripted(p, baseline, size, abuts);
        })
        .join('')
    );
    if (text) {
      segments.push({
        text,
        x: open.x,
        xEnd: open.xEnd,
        ...(isMarkedBold(open.parts) ? { emphasized: true } : {}),
      });
    }
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
  return { y: baseline, size, segments };
}

/** A root over more than one term, or a sum or integral with limits: plain text can't say what is under or over it. */
const UNREADABLE_MATH = /[√∛∜]\s*[^\s,.;:?!)]+\s*[+\-−–·*/^(]|[∑∫∏∬∮]/u;

/** Does this line hold math that reads wrongly as plain text? */
export const hasUnreadableMath = (text: string): boolean =>
  UNREADABLE_MATH.test(text);

const toLine = (row: SegmentedRow): LayoutLine => ({
  ...(row.size ? { size: row.size } : {}),
  text: row.segments.map((s) => s.text).join(' '),
  segments: row.segments.map(({ text, x, xEnd, emphasized }) => ({
    text,
    x,
    xEnd,
    ...(emphasized ? { emphasized: true } : {}),
  })),
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
