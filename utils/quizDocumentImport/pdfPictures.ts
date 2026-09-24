/**
 * Finding the pictures on a PDF page from pdf.js's operator list, so the
 * browser reader can bring them in without AI (QUIZ_IMPORT_RELIABILITY.md PR 4).
 * Pure: the browser wiring hands in the list, the viewport and the text.
 */

import { matchQuestionOpening } from '@/utils/questionNumbering';
import {
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
export type PageBox = Omit<FigureBox, 'page'>;

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
  const boxes: PageBox[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  const push = (box: PageBox | null) => {
    if (box) boxes.push(box);
  };

  for (let i = 0; i < list.fnArray.length; i += 1) {
    const fn = list.fnArray[i];
    const args = (list.argsArray[i] ?? []) as unknown[];
    switch (fn) {
      case ops.save:
        stack.push(ctm);
        break;
      case ops.restore:
        ctm = stack.pop() ?? IDENTITY;
        break;
      case ops.transform:
        if (isMatrix(args)) ctm = multiply(ctm, args);
        break;
      case ops.paintFormXObjectBegin:
        stack.push(ctm);
        if (isMatrix(args[0])) ctm = multiply(ctm, args[0]);
        break;
      case ops.paintFormXObjectEnd:
        ctm = stack.pop() ?? IDENTITY;
        break;
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
  return boxes;
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

/** Tiles of one picture (a scan in strips, a picture with a mask) become one box. */
export function mergeBoxes(boxes: readonly PageBox[]): PageBox[] {
  const merged = [...boxes];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        if (near(merged[i], merged[j], MERGE_GAP)) {
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

const centreInside = (inner: PageBox, outer: PageBox): boolean => {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return (
    cx >= outer.x && cx <= right(outer) && cy >= outer.y && cy <= bottom(outer)
  );
};

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
  const pieces = imageBoxesFromOperatorList(list, ops, viewport).filter(
    (b) => b.width >= MIN_PIECE || b.height >= MIN_PIECE
  );
  const pictures = mergeBoxes(pieces).filter(
    (b) =>
      b.width >= MIN_PICTURE_WIDTH &&
      b.height >= MIN_PICTURE_HEIGHT &&
      !(b.width >= FULL_PAGE && b.height >= FULL_PAGE)
  );
  if (pictures.length === 0) return [];

  const labels = textItems
    .map((item) => textBox(item, viewport))
    .filter((b): b is PageBox => b !== null);
  return pictures.map((picture) =>
    labels
      .filter((label) => centreInside(label, picture))
      .reduce((grown, label) => union(grown, label), picture)
  );
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
export const pictureLine = (box: FigureBox): DocLine => ({
  text: '',
  page: box.page,
  imageIds: [figureKey(box)],
});

/** A line wholly inside a picture is one of its labels. */
const insidePicture = (l: PositionedLine, picture: PageBox): boolean =>
  l.left !== undefined &&
  l.right !== undefined &&
  l.left >= picture.x &&
  l.right <= right(picture) &&
  l.top >= picture.y &&
  l.top <= bottom(picture);

/**
 * One page's lines with a picture line put where the picture sits: after the
 * last line in reading order that starts above it. Lines beside the picture
 * in another column don't count, and labels inside it leave the text.
 */
export function placePictureLines(
  page: number,
  lines: readonly PositionedLine[],
  pictures: readonly PageBox[]
): DocLine[] {
  const insertAt = pictures.map((picture) => {
    const overlaps = (l: PositionedLine) =>
      l.left === undefined ||
      l.right === undefined ||
      (l.left <= right(picture) && l.right >= picture.x);
    let at = 0;
    lines.forEach((l, index) => {
      if (l.top < picture.y && overlaps(l)) at = index + 1;
    });
    return at;
  });
  const order = pictures
    .map((picture, i) => ({ picture, at: insertAt[i] }))
    .sort((p, q) => p.at - q.at || p.picture.y - q.picture.y);

  const out: DocLine[] = [];
  let next = 0;
  for (let index = 0; index <= lines.length; index += 1) {
    while (next < order.length && order[next].at === index) {
      out.push(pictureLine({ page, ...order[next].picture }));
      next += 1;
    }
    const l = lines[index];
    if (l && !pictures.some((picture) => insidePicture(l, picture))) {
      out.push(l.line);
    }
  }
  return out;
}

/** "questions 3–4", "questions 5 and 6", "Questions 7 through 9". */
const QUESTION_RANGE =
  /\bquestions?\s+(\d{1,3})\s*(?:-|–|—|to|through|thru|and|&)\s*(\d{1,3})\b/i;
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
