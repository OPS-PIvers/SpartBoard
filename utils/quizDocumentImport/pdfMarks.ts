/**
 * Underlines and highlighter fills in a PDF. A teacher marks the answer on a
 * key with either as often as with bold, and neither is in the text layer:
 * both are shapes drawn under the words.
 */

import type { PdfOperatorListLike } from './pdfPictures';

/** The `OPS` codes this module reads; pass pdf.js's own `OPS` object. */
export interface PdfMarkOps {
  save: number;
  restore: number;
  transform: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  constructPath?: number;
  setFillRGBColor?: number;
  fill?: number;
  eoFill?: number;
  fillStroke?: number;
  eoFillStroke?: number;
}

/** A box in PDF points, y running up the page. */
export interface MarkRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TextMarks {
  underlines: MarkRect[];
  highlights: MarkRect[];
}

/** What marking needs of a text fragment. */
export interface MarkableItem {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** An underline is thinner than this, in points. */
const MAX_UNDERLINE_THICKNESS = 1.5;
const MIN_UNDERLINE_LENGTH = 4;
/** A highlight is about as tall as a line of text. */
const MIN_HIGHLIGHT_HEIGHT = 6;
const MAX_HIGHLIGHT_HEIGHT = 40;
/** A rule across this share of the page divides sections; it underlines nothing. */
const DIVIDER_SHARE = 0.6;
/** An underline sits this close under its text; a fraction's bar sits lower. */
const UNDERLINE_DROP = 0.22;
/** How much of a fragment a mark must run under or behind. */
const COVERAGE = 0.5;

function multiply(m: Matrix, n: readonly number[]): Matrix {
  return [
    n[0] * m[0] + n[1] * m[2],
    n[0] * m[1] + n[1] * m[3],
    n[2] * m[0] + n[3] * m[2],
    n[2] * m[1] + n[3] * m[3],
    n[4] * m[0] + n[5] * m[2] + m[4],
    n[4] * m[1] + n[5] * m[3] + m[5],
  ];
}

const isMatrix = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length >= 6 &&
  value.slice(0, 6).every((n) => typeof n === 'number' && Number.isFinite(n));

/** A fill colour as 0–255 channels, from `#rrggbb` or three numbers. */
function channels(args: readonly unknown[]): number[] | null {
  const [first] = args;
  if (typeof first === 'string') {
    const hex = /^#?([0-9a-f]{6})$/i.exec(first)?.[1];
    return hex ? [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) : null;
  }
  const rgb = args
    .slice(0, 3)
    .filter((n): n is number => typeof n === 'number');
  return rgb.length === 3 ? rgb : null;
}

/** A highlighter's colour: bright and tinted, so not white paper, black ink or grey shading. */
function isHighlighter(rgb: readonly number[] | null): boolean {
  if (!rgb) return false;
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  return max >= 160 && max - min >= 40;
}

const isWhite = (rgb: readonly number[] | null): boolean =>
  rgb !== null && Math.min(...rgb) >= 235;

/** Every thin horizontal rule and highlighter-coloured box drawn on the page. */
export function textMarks(
  list: PdfOperatorListLike,
  ops: PdfMarkOps
): TextMarks {
  const marks: TextMarks = { underlines: [], highlights: [] };
  if (ops.constructPath === undefined) return marks;
  const fills = new Set(
    [ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke].filter(
      (n): n is number => n !== undefined
    )
  );
  const stack: { ctm: Matrix; fill: number[] | null }[] = [];
  let ctm: Matrix = IDENTITY;
  let fill: number[] | null = [0, 0, 0];

  for (let i = 0; i < list.fnArray.length; i += 1) {
    const fn = list.fnArray[i];
    const args = (list.argsArray[i] ?? []) as unknown[];
    if (fn === ops.save) stack.push({ ctm, fill });
    else if (fn === ops.restore || fn === ops.paintFormXObjectEnd) {
      const saved = stack.pop();
      ctm = saved?.ctm ?? IDENTITY;
      fill = saved?.fill ?? [0, 0, 0];
    } else if (fn === ops.transform) {
      if (isMatrix(args)) ctm = multiply(ctm, args);
    } else if (fn === ops.paintFormXObjectBegin) {
      stack.push({ ctm, fill });
      if (isMatrix(args[0])) ctm = multiply(ctm, args[0]);
    } else if (fn === ops.setFillRGBColor) {
      fill = channels(args);
    } else if (fn === ops.constructPath) {
      const m = args[2] as ArrayLike<number> | null | undefined;
      if (!m || m.length < 4) continue;
      const filled = fills.has(args[0] as number);
      const corners = [
        [m[0], m[1]],
        [m[2], m[1]],
        [m[0], m[3]],
        [m[2], m[3]],
      ].map(([x, y]) => [
        ctm[0] * x + ctm[2] * y + ctm[4],
        ctm[1] * x + ctm[3] * y + ctm[5],
      ]);
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      if (![...xs, ...ys].every(Number.isFinite)) continue;
      const rect = {
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys),
      };
      const width = rect.x1 - rect.x0;
      const height = rect.y1 - rect.y0;
      if (
        height <= MAX_UNDERLINE_THICKNESS &&
        width >= MIN_UNDERLINE_LENGTH &&
        !(filled && isWhite(fill))
      ) {
        marks.underlines.push(rect);
      } else if (
        filled &&
        isHighlighter(fill) &&
        height >= MIN_HIGHLIGHT_HEIGHT &&
        height <= MAX_HIGHLIGHT_HEIGHT &&
        width >= MIN_HIGHLIGHT_HEIGHT
      ) {
        marks.highlights.push(rect);
      }
    }
  }
  return marks;
}

/** Is this fragment underlined or highlighted? `pageWidth` rules out a divider drawn across the page. */
export function isDrawnMarked(
  item: MarkableItem,
  marks: TextMarks,
  pageWidth?: number
): boolean {
  const [, skew, , scaleY, x, y] = item.transform;
  const width = item.width ?? 0;
  const height =
    item.height !== undefined && item.height > 0
      ? item.height
      : Math.abs(scaleY ?? 0);
  if (!item.str.trim() || width <= 0 || height <= 0 || skew) return false;
  const covers = (r: MarkRect): boolean =>
    Math.min(r.x1, x + width) - Math.max(r.x0, x) >= COVERAGE * width;
  const underlined = marks.underlines.some(
    (r) =>
      (pageWidth === undefined || r.x1 - r.x0 < DIVIDER_SHARE * pageWidth) &&
      r.y1 <= y + 0.1 * height &&
      r.y0 >= y - UNDERLINE_DROP * height &&
      covers(r)
  );
  if (underlined) return true;
  return marks.highlights.some(
    (r) =>
      r.y0 <= y + 0.2 * height &&
      r.y1 >= y + 0.6 * height &&
      r.y1 - r.y0 <= 2.5 * height &&
      covers(r)
  );
}
