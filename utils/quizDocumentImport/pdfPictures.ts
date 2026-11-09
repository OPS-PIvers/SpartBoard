/**
 * Finding the pictures on a PDF page from pdf.js's operator list, so the
 * browser reader can bring them in without AI (QUIZ_IMPORT_RELIABILITY.md PR 4).
 * Pure: the browser wiring hands in the list, the viewport and the text.
 */

import { matchQuestionOpening } from '@/utils/questionNumbering';
import {
  FIGURE_PADDING,
  cropPdfFigures,
  figureKey,
  type FigureBox,
  type PdfCropperDeps,
} from './pdfFigures';
import type { DocLine, ExtractedImage, ExtractedQuestion } from './types';

/** The `OPS` codes this module reads; pass pdf.js's own `OPS` object. */
export interface PdfPictureOps {
  save: number;
  restore: number;
  transform: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintImageMaskXObject: number;
  paintSolidColorImageMask: number;
  paintImageXObjectRepeat: number;
  paintImageMaskXObjectRepeat: number;
  paintInlineImageXObjectGroup: number;
  paintImageMaskXObjectGroup: number;
  /** Read when present, so a cropped picture is its visible part and a ruled table is found. */
  clip?: number;
  eoClip?: number;
  constructPath?: number;
}

export interface PdfOperatorListLike {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

/** A page viewport at scale 1: its size and the PDF-space → viewport matrix. */
export interface PdfViewportLike {
  width: number;
  height: number;
  transform: number[];
}

/** A text fragment as pdf.js gives it; `width`/`height` are in PDF units. */
export interface PdfPictureTextItem {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
}

/** A box on one page, as fractions of it from the top-left corner. */
export type PageBox = Omit<FigureBox, 'page'> & {
  /** Captions printed with it, like `figure 2`, that questions name it by. */
  labels?: string[];
  /** A ruled table rather than an image. */
  table?: boolean;
};

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Pieces narrower and shorter than this share of the page are glyphs, not tiles. */
const MIN_PIECE = 0.03;
/** A merged picture must be at least this wide and tall to count. */
const MIN_PICTURE_WIDTH = 0.05;
const MIN_PICTURE_HEIGHT = 0.03;
/** A picture this large on both axes is a page scan or a background. */
const FULL_PAGE = 0.9;
/** Pieces closer than this share of the page belong to one picture. */
const MERGE_GAP = 0.005;
/** A picture repeating in this top or bottom share of the page is a header or footer. */
const EDGE_BAND = 0.12;
/** Pieces with nothing printed between them, this close, are one figure. */
const MAX_FIGURE_GAP = 0.1;
/** A table rule is thinner than this share of the page and at least `MIN_RULE` long. */
const RULE_THICKNESS = 0.004;
const MIN_RULE = 0.03;
const MIN_TABLE_WIDTH = 0.15;
/** A caption or letter label this close to a picture is part of it. */
const CAPTION_GAP = 0.03;
/** How far a line of text rises above and drops below its baseline, as a share of the page. */
const LINE_ASCENT = 0.014;
/** How far the letters themselves rise, without the room above them. */
const INK_HEIGHT = 0.011;
const LINE_DESCENT = 0.004;

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

function apply(m: readonly number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** A path's bounds as a fraction box, kept even when it is a line with no thickness. */
function pathBox(
  minMax: unknown,
  ctm: readonly number[],
  viewport: PdfViewportLike
): PageBox | null {
  const m = minMax as ArrayLike<number> | null | undefined;
  if (!m || m.length < 4) return null;
  const corners = [
    apply(ctm, m[0], m[1]),
    apply(ctm, m[2], m[1]),
    apply(ctm, m[0], m[3]),
    apply(ctm, m[2], m[3]),
  ].map(([x, y]) => apply(viewport.transform, x, y));
  const xs = corners.map((c) => c[0] / viewport.width);
  const ys = corners.map((c) => c[1] / viewport.height);
  if (![...xs, ...ys].every(Number.isFinite)) return null;
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function intersect(a: PageBox, b: PageBox): PageBox | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width);
  const btm = Math.min(a.y + a.height, b.y + b.height);
  if (!(r > x && btm > y)) return null;
  return { x, y, width: r - x, height: btm - y };
}

/** The unit square under `ctm`, as a fraction box of the viewport. */
function unitSquareBox(ctm: Matrix, viewport: PdfViewportLike): PageBox | null {
  return rectBox([0, 0, 1, 1], ctm, viewport);
}

function rectBox(
  [x0, y0, x1, y1]: readonly number[],
  ctm: readonly number[],
  viewport: PdfViewportLike
): PageBox | null {
  const points = [
    apply(ctm, x0, y0),
    apply(ctm, x1, y0),
    apply(ctm, x0, y1),
    apply(ctm, x1, y1),
  ].map(([x, y]) => apply(viewport.transform, x, y));
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const left = Math.max(0, Math.min(...xs) / viewport.width);
  const top = Math.max(0, Math.min(...ys) / viewport.height);
  const right = Math.min(1, Math.max(...xs) / viewport.width);
  const bottom = Math.min(1, Math.max(...ys) / viewport.height);
  if (!(right > left && bottom > top)) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Every image drawn on the page, one box per draw. Each paint op fills the
 * unit square of the current transform, which save/restore/transform and
 * form XObjects move around.
 */
export function imageBoxesFromOperatorList(
  list: PdfOperatorListLike,
  ops: PdfPictureOps,
  viewport: PdfViewportLike
): PageBox[] {
  return pageDrawings(list, ops, viewport).images;
}

/** The page's images, each cut to the clip it was drawn under, and its thin ruled lines. */
export function pageDrawings(
  list: PdfOperatorListLike,
  ops: PdfPictureOps,
  viewport: PdfViewportLike
): { images: PageBox[]; rules: PageBox[] } {
  const boxes: PageBox[] = [];
  const rules: PageBox[] = [];
  const stack: { ctm: Matrix; clip: PageBox | null }[] = [];
  let ctm: Matrix = IDENTITY;
  let clip: PageBox | null = null;
  /** A clip op names the path built just after it. */
  let clipNext = false;
  const push = (box: PageBox | null) => {
    const seen = box && clip ? intersect(box, clip) : box;
    if (seen) boxes.push(seen);
  };

  for (let i = 0; i < list.fnArray.length; i += 1) {
    const fn = list.fnArray[i];
    const args = (list.argsArray[i] ?? []) as unknown[];
    if (fn === ops.clip || fn === ops.eoClip) {
      clipNext = true;
      continue;
    }
    if (fn === ops.constructPath) {
      const box = pathBox(args[2], ctm, viewport);
      if (clipNext) {
        clipNext = false;
        if (box) clip = clip ? (intersect(clip, box) ?? clip) : box;
      } else if (
        box &&
        Math.min(box.width, box.height) <= RULE_THICKNESS &&
        Math.max(box.width, box.height) >= MIN_RULE
      ) {
        rules.push(box);
      }
      continue;
    }
    switch (fn) {
      case ops.save:
        stack.push({ ctm, clip });
        break;
      case ops.restore: {
        const saved = stack.pop();
        ctm = saved?.ctm ?? IDENTITY;
        clip = saved?.clip ?? null;
        break;
      }
      case ops.transform:
        if (isMatrix(args)) ctm = multiply(ctm, args);
        break;
      case ops.paintFormXObjectBegin:
        stack.push({ ctm, clip });
        if (isMatrix(args[0])) ctm = multiply(ctm, args[0]);
        break;
      case ops.paintFormXObjectEnd: {
        const saved = stack.pop();
        ctm = saved?.ctm ?? IDENTITY;
        clip = saved?.clip ?? null;
        break;
      }
      case ops.paintImageXObject:
      case ops.paintInlineImageXObject:
      case ops.paintImageMaskXObject:
      case ops.paintSolidColorImageMask:
        push(unitSquareBox(ctm, viewport));
        break;
      case ops.paintImageXObjectRepeat: {
        const [, scaleX, scaleY, positions] = args as [
          unknown,
          number,
          number,
          ArrayLike<number>,
        ];
        for (let p = 0; p + 1 < (positions?.length ?? 0); p += 2) {
          const tile = [scaleX, 0, 0, scaleY, positions[p], positions[p + 1]];
          if (isMatrix(tile))
            push(unitSquareBox(multiply(ctm, tile), viewport));
        }
        break;
      }
      case ops.paintImageMaskXObjectRepeat: {
        const [, scaleX, skewX, skewY, scaleY, positions] = args as [
          unknown,
          number,
          number,
          number,
          number,
          ArrayLike<number>,
        ];
        for (let p = 0; p + 1 < (positions?.length ?? 0); p += 2) {
          const tile = [
            scaleX,
            skewX ?? 0,
            skewY ?? 0,
            scaleY,
            positions[p],
            positions[p + 1],
          ];
          if (isMatrix(tile))
            push(unitSquareBox(multiply(ctm, tile), viewport));
        }
        break;
      }
      case ops.paintInlineImageXObjectGroup: {
        const map = args[1] as Array<{ transform?: unknown }> | undefined;
        for (const entry of map ?? []) {
          if (isMatrix(entry.transform)) {
            push(unitSquareBox(multiply(ctm, entry.transform), viewport));
          }
        }
        break;
      }
      case ops.paintImageMaskXObjectGroup: {
        const images = args[0] as Array<{ transform?: unknown }> | undefined;
        for (const image of images ?? []) {
          if (isMatrix(image.transform)) {
            push(unitSquareBox(multiply(ctm, image.transform), viewport));
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return { images: boxes, rules };
}

const right = (b: PageBox) => b.x + b.width;
const bottom = (b: PageBox) => b.y + b.height;

function union(a: PageBox, b: PageBox): PageBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(right(a), right(b)) - x,
    height: Math.max(bottom(a), bottom(b)) - y,
  };
}

function near(a: PageBox, b: PageBox, gap: number): boolean {
  return (
    a.x <= right(b) + gap &&
    b.x <= right(a) + gap &&
    a.y <= bottom(b) + gap &&
    b.y <= bottom(a) + gap
  );
}

const wholePicture = (b: PageBox): boolean =>
  b.width >= MIN_PICTURE_WIDTH && b.height >= MIN_PICTURE_HEIGHT;

const sameSpan = (a0: number, a1: number, b0: number, b1: number): boolean =>
  Math.abs(a0 - b0) <= 0.01 && Math.abs(a1 - b1) <= 0.01;

/** Two full-size pictures that only sit next to each other, not strips of one, are two figures. */
function separateFigures(a: PageBox, b: PageBox): boolean {
  if (!wholePicture(a) || !wholePicture(b)) return false;
  if (near(a, b, -MERGE_GAP)) return false;
  return !(
    sameSpan(a.x, right(a), b.x, right(b)) ||
    sameSpan(a.y, bottom(a), b.y, bottom(b))
  );
}

/** Tiles of one picture (a scan in strips, a picture with a mask) become one box. */
export function mergeBoxes(boxes: readonly PageBox[]): PageBox[] {
  const merged = [...boxes];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        if (
          near(merged[i], merged[j], MERGE_GAP) &&
          !separateFigures(merged[i], merged[j])
        ) {
          merged[i] = union(merged[i], merged[j]);
          merged.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return merged;
}

/** The empty strip between two boxes stacked or side by side; null when they are neither or it is too wide. */
function stripBetween(a: PageBox, b: PageBox): PageBox | null {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const r = Math.max(right(a), right(b));
  const btm = Math.max(bottom(a), bottom(b));
  const overlapX = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
  const overlapY = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
  if (overlapX > 0 && overlapY <= 0 && -overlapY <= MAX_FIGURE_GAP) {
    const top = Math.min(bottom(a), bottom(b));
    return { x, y: top, width: r - x, height: -overlapY };
  }
  if (overlapY > 0 && overlapX <= 0 && -overlapX <= MAX_FIGURE_GAP) {
    const left = Math.min(right(a), right(b));
    return { x: left, y, width: -overlapX, height: btm - y };
  }
  return null;
}

/** Pieces of one drawing set apart, with nothing printed between them, become one figure. */
export function mergeAcrossGaps(
  boxes: readonly PageBox[],
  text: readonly PageBox[]
): PageBox[] {
  const merged = [...boxes];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        const strip = stripBetween(merged[i], merged[j]);
        const apart =
          separateFigures(merged[i], merged[j]) ||
          (!near(merged[i], merged[j], 0) &&
            (!strip || text.some((t) => centreInside(t, strip))));
        if (apart) continue;
        merged[i] = union(merged[i], merged[j]);
        merged.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return merged;
}

/** Ruled lines that cross into a grid are a table; its outline is the box. */
export function tableBoxes(rules: readonly PageBox[]): PageBox[] {
  const groups = rules.map((rule) => {
    const flat = rule.width >= rule.height;
    return { box: rule, across: flat ? 1 : 0, down: flat ? 0 : 1 };
  });
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        if (!near(groups[i].box, groups[j].box, MERGE_GAP)) continue;
        groups[i] = {
          box: union(groups[i].box, groups[j].box),
          across: groups[i].across + groups[j].across,
          down: groups[i].down + groups[j].down,
        };
        groups.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return groups
    .filter(
      (g) =>
        g.across >= 2 &&
        g.down >= 2 &&
        g.box.width >= MIN_TABLE_WIDTH &&
        g.box.height >= MIN_PICTURE_HEIGHT &&
        !(g.box.width >= FULL_PAGE && g.box.height >= FULL_PAGE)
    )
    .map((g) => ({ ...g.box, table: true }));
}

/** A text fragment's box, from its baseline transform and advance width. */
function textBox(
  item: PdfPictureTextItem,
  viewport: PdfViewportLike
): PageBox | null {
  const t = item.transform;
  if (!isMatrix(t) || !item.str.trim()) return null;
  const size = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]);
  if (!size) return null;
  const width = item.width ?? item.str.length * size * 0.5;
  const height =
    item.height !== undefined && item.height > 0 ? item.height : size;
  // Baseline space: the glyphs rise from y = 0; a little room for descenders.
  const unit = [t[0] / size, t[1] / size, t[2] / size, t[3] / size, t[4], t[5]];
  return rectBox([0, -0.2 * height, width, 0.8 * height], unit, viewport);
}

function centreInside(inner: PageBox, outer: PageBox): boolean {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return (
    cx >= outer.x && cx <= right(outer) && cy >= outer.y && cy <= bottom(outer)
  );
}

/**
 * The pictures worth bringing in on one page: tiles merged, glyph-sized
 * pieces and page-sized scans dropped, and each box grown to take in the
 * labels drawn over it.
 */
export function picturesOnPage(
  list: PdfOperatorListLike,
  ops: PdfPictureOps,
  viewport: PdfViewportLike,
  textItems: readonly PdfPictureTextItem[] = []
): PageBox[] {
  const drawn = pageDrawings(list, ops, viewport);
  const pieces = drawn.images.filter(
    (b) => b.width >= MIN_PIECE || b.height >= MIN_PIECE
  );
  const labels = textItems
    .map((item) => textBox(item, viewport))
    .filter((b): b is PageBox => b !== null);
  const pictures = mergeAcrossGaps(mergeBoxes(pieces), labels).filter(
    (b) =>
      b.width >= MIN_PICTURE_WIDTH &&
      b.height >= MIN_PICTURE_HEIGHT &&
      !(b.width >= FULL_PAGE && b.height >= FULL_PAGE)
  );
  const grown = pictures.map((picture) =>
    labels
      .filter((label) => centreInside(label, picture))
      .reduce((box, label) => union(box, label), picture)
  );
  // A grid drawn over a picture is that picture's own.
  const tables = tableBoxes(drawn.rules).filter(
    (table) => !grown.some((picture) => near(table, picture, 0))
  );
  return [...grown, ...tables];
}

const roundedKey = (b: PageBox) =>
  [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 100)).join(':');

/**
 * Drops a logo or rule that repeats in the same spot near the top or bottom
 * of more than one page. `boxesByPage[i]` is page i + 1.
 */
export function dropRepeatedEdgePictures(
  boxesByPage: readonly PageBox[][]
): PageBox[][] {
  const pagesByKey = new Map<string, number>();
  for (const boxes of boxesByPage) {
    for (const key of new Set(boxes.map(roundedKey))) {
      pagesByKey.set(key, (pagesByKey.get(key) ?? 0) + 1);
    }
  }
  return boxesByPage.map((boxes) =>
    boxes.filter((b) => {
      const atEdge = b.y < EDGE_BAND || bottom(b) > 1 - EDGE_BAND;
      return !(atEdge && (pagesByKey.get(roundedKey(b)) ?? 0) >= 2);
    })
  );
}

/** One line of a page with where it sits, as fractions of the page. */
export interface PositionedLine {
  line: DocLine;
  top: number;
  left?: number;
  right?: number;
}

/** A picture line carries its box's `figureKey` until the crop gives it a real id. */
export const pictureLine = (box: FigureBox & PageBox): DocLine => {
  const key = figureKey(box);
  return {
    text: '',
    page: box.page,
    imageIds: [key],
    ...(box.labels?.length ? { figureLabels: { [key]: box.labels } } : {}),
  };
};

/** A sentence is text, even where a picture's box runs over it. */
const MAX_LABEL_WORDS = 10;

const isSentence = (line: DocLine): boolean =>
  (line.segments?.length ?? 1) <= 1 &&
  line.text.trim().split(/\s+/).length > MAX_LABEL_WORDS;

const OPTION_LINE = /^\s*\(?[A-Fa-f][.)](?:\s|$)/;

/** A line that opens a question or an answer choice is never part of a picture. */
const isStructural = (line: DocLine): boolean =>
  matchQuestionOpening(line.text.trim()) !== null ||
  (line.segments ?? [{ text: line.text }]).some((s) =>
    OPTION_LINE.test(s.text)
  );

const within = (l: PositionedLine, picture: PageBox): boolean =>
  l.left !== undefined &&
  l.right !== undefined &&
  l.left >= picture.x &&
  l.right <= right(picture) &&
  l.top >= picture.y &&
  l.top <= bottom(picture);

/** A line wholly inside a picture is one of its labels, unless it is a sentence, a question or a choice. */
const insidePicture = (l: PositionedLine, picture: PageBox): boolean =>
  !isSentence(l.line) && !isStructural(l.line) && within(l, picture);

/** "(Figure 2)", "Graph 1", "Table A: Melting points": the kind and the number or letter. */
const CAPTION =
  /^\(?\s*(fig(?:ure)?\.?|graph|table|diagram|chart|image|picture|map)\s*#?\s*(\d{1,3}|[A-Z])\s*\)?(?=\s*(?:$|[.:)\-–—]))/i;
const MAX_CAPTION_WORDS = 8;

const kindOf = (word: string): string =>
  /^fig/i.test(word) ? 'figure' : word.toLowerCase().replace(/s$/, '');

/** A caption line's label as questions name it, `figure 2`; null when the line is no caption. */
export function captionLabel(text: string): string | null {
  const trimmed = text.trim();
  const m = CAPTION.exec(trimmed);
  if (!m || trimmed.split(/\s+/).length > MAX_CAPTION_WORDS) return null;
  return `${kindOf(m[1])} ${m[2].toLowerCase()}`;
}

/** Every caption on a line that holds nothing else, "(Figure 3)    (Figure 4)"; none when it holds other text. */
export function captionLabels(text: string): string[] {
  const parts = text
    .trim()
    .split(/\s{2,}/)
    .filter(Boolean);
  const labels = parts.map(captionLabel);
  return labels.every((label): label is string => label !== null) ? labels : [];
}

const HEADING_WORD = /^(?:section|part|unit|chapter|topic|name|date|class)\b/i;

/** "A", "B", "Reaction 1": a few words that can only be a picture's own lettering. */
function isShortLabel(line: DocLine): boolean {
  const text = line.text.trim();
  return (
    text.length <= 24 &&
    text.split(/\s+/).length <= 3 &&
    /[\p{L}\d]/u.test(text) &&
    !/_{2,}|[.?!:,;]$/.test(text) &&
    !HEADING_WORD.test(text) &&
    !isStructural(line)
  );
}

/** The last words of a paragraph wrapped onto their own line, not a label. */
function isWrapTail(
  l: PositionedLine,
  previous: PositionedLine | undefined
): boolean {
  if (!previous || previous.left === undefined || l.left === undefined) {
    return false;
  }
  const drop = l.top - previous.top;
  return (
    drop > 0 &&
    drop <= CAPTION_GAP &&
    Math.abs(l.left - previous.left) <= 0.012 &&
    previous.line.text.trim().split(/\s+/).length > 3
  );
}

const lineBox = (l: PositionedLine): PageBox | null =>
  l.left === undefined || l.right === undefined
    ? null
    : {
        x: l.left,
        y: l.top - LINE_ASCENT,
        width: l.right - l.left,
        height: LINE_ASCENT + LINE_DESCENT,
      };

/**
 * Each picture grown to take in the caption and letters printed right above
 * or below it, with the captions kept as the names questions call it by. A
 * table holding a question, a choice or a sentence is layout, so it is dropped.
 */
export function growPicturesToLabels(
  lines: readonly PositionedLine[],
  pictures: readonly PageBox[]
): PageBox[] {
  const out: PageBox[] = [];
  for (const picture of pictures) {
    if (picture.table) {
      const held = lines.filter((l) => within(l, picture));
      if (
        held.length < 2 ||
        held.some((l) => isSentence(l.line) || isStructural(l.line))
      ) {
        continue;
      }
    }
    let box: PageBox = picture;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < lines.length; i += 1) {
        const l = lines[i];
        const text = lineBox(l);
        if (!text || within(l, box)) continue;
        const caption = captionLabel(l.line.text) !== null;
        if (!caption && !isShortLabel(l.line)) continue;
        if (isWrapTail(l, lines[i - 1])) continue;
        const centre = text.x + text.width / 2;
        if (centre < box.x || centre > right(box)) continue;
        const gap = Math.max(box.y - bottom(text), text.y - bottom(box));
        if (gap > CAPTION_GAP) continue;
        box = { ...union(box, text), ...(box.table ? { table: true } : {}) };
        grew = true;
      }
    }
    const labels = [
      ...new Set(
        lines
          .filter((l) => insidePicture(l, box))
          .map((l) => captionLabel(l.line.text))
          .filter((label): label is string => label !== null)
      ),
    ];
    // The crop's margin stops short of the line of text printed just under or over it.
    let top = box.y;
    let end = bottom(box);
    for (const l of lines) {
      const text = lineBox(l);
      if (!text || insidePicture(l, box)) continue;
      if (text.x > right(box) || right(text) < box.x) continue;
      const inkTop = l.top - INK_HEIGHT;
      if (inkTop >= end - FIGURE_PADDING && inkTop < end + FIGURE_PADDING) {
        end = Math.min(end, inkTop - FIGURE_PADDING);
      }
      if (l.top <= top + FIGURE_PADDING && l.top > top - FIGURE_PADDING) {
        top = Math.max(top, l.top + FIGURE_PADDING);
      }
    }
    if (end - top >= MIN_PICTURE_HEIGHT) {
      box = { ...box, y: top, height: end - top };
    }
    out.push({ ...box, ...(labels.length > 0 ? { labels } : {}) });
  }
  return out;
}

/** A question's number with nothing after it. */
const LONE_NUMBER = /^(?:_{2,}\s*)?\d{1,3}[.)]$/;
/** How far above a picture's top its lone number may start, as a share of the page. */
const LONE_NUMBER_REACH = 0.03;

/**
 * One page's lines with a picture line put where the picture sits. A picture
 * with a question printed beside it goes to that question; otherwise it goes
 * after the last line in reading order that starts above it. Labels inside
 * it leave the text.
 */
export function placePictureLines(
  page: number,
  lines: readonly PositionedLine[],
  pictures: readonly PageBox[]
): DocLine[] {
  const labels = new Set<PositionedLine>();
  lines.forEach((l, i) => {
    if (!pictures.some((picture) => insidePicture(l, picture))) return;
    // A paragraph's last words can drop into the top of a picture's box.
    const previous = lines[i - 1];
    if (previous && !labels.has(previous) && isWrapTail(l, previous)) return;
    labels.add(l);
  });
  const label = (l: PositionedLine) => labels.has(l);
  /** Picture keys that go straight onto a question's opening line. */
  const onLine = new Map<number, string[]>();
  const leading = new Set<PageBox>();
  /** Pictures that went to more than one question by position alone. */
  const sharedBeside = new Set<PageBox>();

  const insertAt = pictures.map((picture) => {
    const overlaps = (l: PositionedLine) =>
      l.left === undefined ||
      l.right === undefined ||
      (l.left <= right(picture) && l.right >= picture.x);
    let at = 0;
    let above: PositionedLine | undefined;
    lines.forEach((l, index) => {
      if (l.top < picture.y && overlaps(l) && !label(l)) {
        at = index + 1;
        above = l;
      }
    });

    // A test bank prints the number by itself in the margin, level with the picture's top.
    const numbered = lines.findIndex(
      (l) =>
        !label(l) &&
        LONE_NUMBER.test(l.line.text.trim()) &&
        l.right !== undefined &&
        l.right <= picture.x &&
        l.top >= picture.y - LONE_NUMBER_REACH &&
        l.top <= bottom(picture) + LONE_NUMBER_REACH
    );
    if (numbered >= 0) return numbered + 1;

    const beside = lines
      .map((l, index) => ({ l, index }))
      .filter(
        ({ l }) =>
          !label(l) &&
          l.left !== undefined &&
          l.right !== undefined &&
          l.top >= picture.y &&
          l.top <= bottom(picture) &&
          (l.right < picture.x || l.left > right(picture))
      );
    if (beside.length > 0) {
      const left = Math.min(...beside.map(({ l }) => l.left ?? 0));
      const rightEdge = Math.max(...beside.map(({ l }) => l.right ?? 0));
      // On a two-column page the picture sits under its own column's text, not beside the other column's.
      const neighbour =
        above ??
        lines.find((l) => l.top > bottom(picture) && overlaps(l) && !label(l));
      const ownColumn =
        neighbour !== undefined &&
        !(
          neighbour.left !== undefined &&
          neighbour.right !== undefined &&
          neighbour.left <= rightEdge &&
          neighbour.right >= left
        );
      if (!ownColumn) {
        const first = beside[0];
        for (const { l, index } of beside.slice(1)) {
          if (
            matchQuestionOpening(l.line.text.trim()) &&
            l.top <= bottom(picture) - 0.02
          ) {
            const key = figureKey({ page, ...picture });
            onLine.set(index, [...(onLine.get(index) ?? []), key]);
            sharedBeside.add(picture);
          }
        }
        return first.index + 1;
      }
    }

    // A picture heading the page belongs to the question under it, not the page before.
    const under = lines.find((l, index) => index >= at && !label(l));
    if (at === 0 && under && matchQuestionOpening(under.line.text.trim())) {
      leading.add(picture);
    }
    // A paragraph's last words stay with it, above the picture.
    while (at > 0 && lines[at] && isWrapTail(lines[at], lines[at - 1])) {
      at += 1;
    }
    return at;
  });
  const order = pictures
    .map((picture, i) => ({ picture, at: insertAt[i] }))
    .sort((p, q) => p.at - q.at || p.picture.y - q.picture.y);

  const out: DocLine[] = [];
  let next = 0;
  for (let index = 0; index <= lines.length; index += 1) {
    while (next < order.length && order[next].at === index) {
      const picture = order[next].picture;
      out.push({
        ...pictureLine({ page, ...picture }),
        ...(leading.has(picture) ? { leads: true } : {}),
        ...(sharedBeside.has(picture)
          ? { besideIds: [figureKey({ page, ...picture })] }
          : {}),
      });
      next += 1;
    }
    const l = lines[index];
    if (l && !label(l)) {
      const keys = onLine.get(index);
      out.push(
        keys
          ? {
              ...l.line,
              imageIds: [...(l.line.imageIds ?? []), ...keys],
              besideIds: keys,
            }
          : l.line
      );
    }
  }
  return out;
}

/** "questions 3–4", "questions 5 and 6", "Questions # 10 and 11", "Questions 7 through 9". */
const QUESTION_RANGE =
  /\bquestions?\s*#?\s*(\d{1,3})\s*(?:-|–|—|to|through|thru|and|&)\s*#?\s*(\d{1,3})\b/i;
/** Lines looked back over for a "use this for questions n–m" instruction. */
const RANGE_LOOKBACK = 3;
const MAX_RANGE = 10;

const isPictureOnly = (line: DocLine) =>
  !line.text.trim() && (line.imageIds?.length ?? 0) > 0;

/**
 * A picture under "Use the diagram for questions 3–4" belongs to 3 and 4, not
 * to whichever question it happens to follow. Its ids move onto those
 * questions' opening lines, so the picture stays one image linked twice (D14).
 */
export function sharePicturesAcrossRanges(
  lines: readonly DocLine[]
): DocLine[] {
  const out = lines.map((line) => ({ ...line }));
  const dropped = new Set<number>();

  out.forEach((line, index) => {
    if (!isPictureOnly(line)) return;
    let range: [number, number] | null = null;
    for (
      let back = index - 1, seen = 0;
      back >= 0 && seen < RANGE_LOOKBACK;
      back -= 1
    ) {
      const text = out[back].text.trim();
      if (!text) continue;
      seen += 1;
      const m = QUESTION_RANGE.exec(text);
      if (m) {
        const from = Number(m[1]);
        const to = Number(m[2]);
        if (to > from && to - from < MAX_RANGE) range = [from, to];
        break;
      }
    }
    if (!range) return;
    const [from, to] = range;

    let openNumber: number | null = null;
    for (let back = index - 1; back >= 0; back -= 1) {
      const opening = matchQuestionOpening(out[back].text.trim());
      if (opening) {
        openNumber = opening.number;
        break;
      }
    }

    const ids = line.imageIds ?? [];
    let linked = 0;
    for (let next = index + 1; next < out.length; next += 1) {
      const opening = matchQuestionOpening(out[next].text.trim());
      if (!opening) continue;
      if (opening.number > to || opening.number < from) break;
      out[next].imageIds = [...(out[next].imageIds ?? []), ...ids];
      if (line.figureLabels) {
        out[next].figureLabels = {
          ...out[next].figureLabels,
          ...line.figureLabels,
        };
      }
      linked += 1;
    }
    const openInRange =
      openNumber !== null && openNumber >= from && openNumber <= to;
    if (linked > 0 && !openInRange) dropped.add(index);
  });

  return out.filter((_, index) => !dropped.has(index));
}

/** The picture keys questions point at, as the boxes to crop. */
export function usedPictureBoxes(
  pictures: readonly FigureBox[],
  questions: readonly { imageIds: readonly string[] }[]
): FigureBox[] {
  const used = new Set(questions.flatMap((q) => q.imageIds));
  const seen = new Set<string>();
  return pictures.filter((box) => {
    const key = figureKey(box);
    if (!used.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Swaps picture keys for the cropped images' ids; a picture that didn't crop is dropped. */
export function resolvePictureIds<Q extends { imageIds: string[] }>(
  questions: readonly Q[],
  idByBox: ReadonlyMap<string, string>
): Q[] {
  return questions.map((q) => ({
    ...q,
    imageIds: [
      ...new Set(
        q.imageIds
          .map((key) => idByBox.get(key))
          .filter((id): id is string => id !== undefined)
      ),
    ],
  }));
}

export const PDF_PICTURES_FAILED =
  'Pictures in this PDF couldn’t be brought in — add them in the editor.';

/**
 * Crops the pictures the questions point at and swaps their keys for image
 * ids. Opening the PDF for cropping failing costs the pictures, not the read.
 */
export async function attachPdfPictures(
  file: Blob,
  questions: readonly ExtractedQuestion[],
  pictures: readonly FigureBox[],
  makeCropper: (file: Blob) => Promise<PdfCropperDeps>
): Promise<{
  questions: ExtractedQuestion[];
  images: ExtractedImage[];
  warnings: string[];
}> {
  const used = usedPictureBoxes(pictures, questions);
  if (used.length === 0) {
    return {
      questions: resolvePictureIds(questions, new Map()),
      images: [],
      warnings: [],
    };
  }
  try {
    const cropped = await cropPdfFigures(used, await makeCropper(file));
    return {
      questions: resolvePictureIds(questions, cropped.idByBox),
      images: cropped.images,
      warnings: cropped.warnings,
    };
  } catch (err) {
    console.warn('[quizDocumentImport] could not crop the PDF', err);
    return {
      questions: resolvePictureIds(questions, new Map()),
      images: [],
      warnings: [PDF_PICTURES_FAILED],
    };
  }
}
