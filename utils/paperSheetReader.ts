/**
 * Reads one scanned page of a paper answer sheet (plan §4).
 *
 * Pure: takes RGBA pixels, returns what was bubbled. Every position it samples
 * comes from `paperSheetLayout.ts` through an affine transform fitted to the
 * four printed registration marks, so print scale, scanner offset and a page
 * fed upside down are all corrected rather than trusted.
 */

import {
  DEFAULT_COLUMNS_PER_PAGE,
  MARKER_CELL_COUNT,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  REGISTRATION_MARK_CENTERS_MM,
  REGISTRATION_MARK_SIZE_MM,
  STIMULUS_RECT_MM,
  bubbleRectMm,
  markerCellRectMm,
  questionRowRectMm,
  questionsPerPage,
  type PaperGrid,
  type PointMm,
  type RectMm,
} from './paperSheetLayout';
import { decodePaperMarker, type PaperMarkerPayload } from './paperSheetMarker';

/** RGBA pixels, the shape of a canvas `ImageData`. */
export interface RasterPage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PointPx {
  x: number;
  y: number;
}

export interface RectPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Every tunable in one place, so a field adjustment is a one-line change. */
export const READER_THRESHOLDS = {
  /** Fill ratio at or above which a bubble counts as a mark (a light check reads ~0.10). */
  mark: 0.1,
  /** Fill ratio at or above which a bubble is at least a possible mark; below is noise. */
  faint: 0.06,
  /** A runner-up at or above this share of the top bubble makes the row 'multiple'. */
  dominance: 0.6,
  /** Fraction of the bubble radius sampled; keeps the printed ring out of the count. */
  bubbleSampleRadius: 0.65,
  /** Fraction of each marker cell edge trimmed before sampling. */
  markerSampleInset: 0.25,
  /** Fill ratio at or above which a marker cell reads as inked. */
  markerInked: 0.5,
  /** Fraction of the page, from each corner, searched for a registration mark. */
  registrationSearchFraction: 0.16,
  /** Registration blobs outside this multiple of the expected area are ignored. */
  registrationAreaTolerance: [0.3, 3] as const,
  /** Mean fit error across the four marks past which the page is rejected. */
  maxRegistrationResidualMm: 1.5,
  /** Spacing of sample points inside a rect, in millimetres. */
  sampleStepMm: 0.3,
  /** Margin around the stimulus band kept out of the second Otsu pass (D4). */
  stimulusOtsuMarginMm: 6,
};

/** `px = [a b; d e] · mm + [c f]`. */
export interface AffineMmToPx {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export function applyAffine(t: AffineMmToPx, p: PointMm): PointPx {
  return { x: t.a * p.x + t.b * p.y + t.c, y: t.d * p.x + t.e * p.y + t.f };
}

function solve3(m: number[][], v: number[]): number[] | null {
  const a = m.map((row, i) => [...row, v[i]]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 3; r += 1) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < 3; r += 1) {
      if (r === col) continue;
      const k = a[r][col] / a[col][col];
      for (let c = col; c < 4; c += 1) a[r][c] -= k * a[col][c];
    }
  }
  return a.map((row, i) => row[3] / row[i]);
}

/** Least-squares affine fit; residual is the mean pixel error over the pairs. */
export function fitAffine(
  pairs: readonly { mm: PointMm; px: PointPx }[]
): { transform: AffineMmToPx; residualPx: number } | null {
  if (pairs.length < 3) return null;
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atx = [0, 0, 0];
  const aty = [0, 0, 0];
  for (const { mm, px } of pairs) {
    const row = [mm.x, mm.y, 1];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) ata[i][j] += row[i] * row[j];
      atx[i] += row[i] * px.x;
      aty[i] += row[i] * px.y;
    }
  }
  const xs = solve3(ata, atx);
  const ys = solve3(ata, aty);
  if (!xs || !ys) return null;
  const transform = {
    a: xs[0],
    b: xs[1],
    c: xs[2],
    d: ys[0],
    e: ys[1],
    f: ys[2],
  };
  let err = 0;
  for (const { mm, px } of pairs) {
    const p = applyAffine(transform, mm);
    err += Math.hypot(p.x - px.x, p.y - px.y);
  }
  return { transform, residualPx: err / pairs.length };
}

/** Pixels per millimetre the transform implies, from its scale. */
export function affineScalePxPerMm(t: AffineMmToPx): number {
  return Math.sqrt(Math.abs(t.a * t.e - t.b * t.d));
}

/** Luminance per pixel, the one input every threshold decision is taken from. */
export function toGrayscale(page: RasterPage): Uint8Array {
  const n = page.width * page.height;
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    gray[i] =
      ((page.data[o] * 299 + page.data[o + 1] * 587 + page.data[o + 2] * 114) /
        1000) |
      0;
  }
  return gray;
}

/**
 * Otsu's threshold, so scanner exposure needs no tuning.
 *
 * `ignore` drops a pixel box from the histogram without changing what is
 * thresholded: a teacher's artwork can then sit on the page without dragging
 * the cut that has to keep the grey choice letters out of the bubbles (D4).
 */
export function otsuThreshold(
  gray: Uint8Array,
  width: number,
  height: number,
  ignore?: RectPx
): number {
  const histogram = new Uint32Array(256);
  let n = 0;
  for (let y = 0; y < height; y += 1) {
    const inBandY =
      !!ignore && y >= ignore.y && y < ignore.y + ignore.h && ignore.h > 0;
    const rowStart = y * width;
    for (let x = 0; x < width; x += 1) {
      if (inBandY && x >= ignore.x && x < ignore.x + ignore.w) continue;
      histogram[gray[rowStart + x]] += 1;
      n += 1;
    }
  }
  if (n === 0) return 127;
  let sum = 0;
  for (let v = 0; v < 256; v += 1) sum += v * histogram[v];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let v = 0; v < 256; v += 1) {
    wB += histogram[v];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += v * histogram[v];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = v;
    }
  }
  return threshold;
}

const thresholdGray = (gray: Uint8Array, threshold: number): Uint8Array => {
  const dark = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i += 1)
    dark[i] = gray[i] <= threshold ? 1 : 0;
  return dark;
};

/** 1 = dark, at the page-wide Otsu cut. */
export function binarize(page: RasterPage): Uint8Array {
  const gray = toGrayscale(page);
  return thresholdGray(gray, otsuThreshold(gray, page.width, page.height));
}

interface DarkBlob {
  area: number;
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Connected dark blobs inside a window, 4-connected flood fill. */
function blobsInWindow(
  dark: Uint8Array,
  width: number,
  win: RectPx
): DarkBlob[] {
  const seen = new Uint8Array(win.w * win.h);
  const blobs: DarkBlob[] = [];
  const stack: number[] = [];
  for (let wy = 0; wy < win.h; wy += 1) {
    for (let wx = 0; wx < win.w; wx += 1) {
      const local = wy * win.w + wx;
      if (seen[local] || !dark[(win.y + wy) * width + (win.x + wx)]) continue;
      const blob: DarkBlob = {
        area: 0,
        cx: 0,
        cy: 0,
        minX: wx,
        minY: wy,
        maxX: wx,
        maxY: wy,
      };
      seen[local] = 1;
      stack.push(local);
      while (stack.length) {
        const cur = stack.pop() as number;
        const cx = cur % win.w;
        const cy = (cur - cx) / win.w;
        blob.area += 1;
        blob.cx += cx;
        blob.cy += cy;
        if (cx < blob.minX) blob.minX = cx;
        if (cx > blob.maxX) blob.maxX = cx;
        if (cy < blob.minY) blob.minY = cy;
        if (cy > blob.maxY) blob.maxY = cy;
        const neighbours = [
          cx > 0 ? cur - 1 : -1,
          cx < win.w - 1 ? cur + 1 : -1,
          cy > 0 ? cur - win.w : -1,
          cy < win.h - 1 ? cur + win.w : -1,
        ];
        for (const nb of neighbours) {
          if (nb < 0 || seen[nb]) continue;
          const nx = nb % win.w;
          const ny = (nb - nx) / win.w;
          if (!dark[(win.y + ny) * width + (win.x + nx)]) continue;
          seen[nb] = 1;
          stack.push(nb);
        }
      }
      blob.cx = blob.cx / blob.area + win.x;
      blob.cy = blob.cy / blob.area + win.y;
      blob.minX += win.x;
      blob.maxX += win.x;
      blob.minY += win.y;
      blob.maxY += win.y;
      blobs.push(blob);
    }
  }
  return blobs;
}

/**
 * Find the four registration marks, in `REGISTRATION_MARK_CENTERS_MM` order.
 *
 * Each corner window is searched for the solid, roughly square blob nearest
 * the mark's expected position at the page's nominal scale. A scanner-lid
 * border or a stray staple fails the size or squareness test and is skipped.
 */
export function findRegistrationMarks(
  dark: Uint8Array,
  width: number,
  height: number
): PointPx[] | null {
  const nominalScale = Math.min(width / PAGE_WIDTH_MM, height / PAGE_HEIGHT_MM);
  const expectedArea = (REGISTRATION_MARK_SIZE_MM * nominalScale) ** 2;
  const [lo, hi] = READER_THRESHOLDS.registrationAreaTolerance;
  const winW = Math.round(width * READER_THRESHOLDS.registrationSearchFraction);
  const winH = Math.round(
    height * READER_THRESHOLDS.registrationSearchFraction
  );
  const found: PointPx[] = [];
  for (const centre of REGISTRATION_MARK_CENTERS_MM) {
    const left = centre.x < PAGE_WIDTH_MM / 2;
    const top = centre.y < PAGE_HEIGHT_MM / 2;
    const win: RectPx = {
      x: left ? 0 : width - winW,
      y: top ? 0 : height - winH,
      w: winW,
      h: winH,
    };
    const expected: PointPx = {
      x: left
        ? centre.x * nominalScale
        : width - (PAGE_WIDTH_MM - centre.x) * nominalScale,
      y: top
        ? centre.y * nominalScale
        : height - (PAGE_HEIGHT_MM - centre.y) * nominalScale,
    };
    let best: { blob: DarkBlob; distance: number } | null = null;
    for (const blob of blobsInWindow(dark, width, win)) {
      if (blob.area < expectedArea * lo || blob.area > expectedArea * hi)
        continue;
      const bw = blob.maxX - blob.minX + 1;
      const bh = blob.maxY - blob.minY + 1;
      const aspect = bw / bh;
      if (aspect < 0.6 || aspect > 1.7) continue;
      if (blob.area / (bw * bh) < 0.6) continue;
      const distance = Math.hypot(blob.cx - expected.x, blob.cy - expected.y);
      if (!best || distance < best.distance) best = { blob, distance };
    }
    if (!best) return null;
    found.push({ x: best.blob.cx, y: best.blob.cy });
  }
  return found;
}

type MapMm = (p: PointMm) => PointPx;

/** Fraction of sample points inside `rect` (optionally its inscribed disc) that are dark. */
function fillRatio(
  dark: Uint8Array,
  width: number,
  height: number,
  map: MapMm,
  rect: RectMm,
  disc: boolean
): number {
  const step = READER_THRESHOLDS.sampleStepMm;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const r = rect.w / 2;
  let sampled = 0;
  let inked = 0;
  for (let y = rect.y + step / 2; y < rect.y + rect.h; y += step) {
    for (let x = rect.x + step / 2; x < rect.x + rect.w; x += step) {
      if (disc && Math.hypot(x - cx, y - cy) > r) continue;
      const p = map({ x, y });
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      sampled += 1;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      if (dark[py * width + px]) inked += 1;
    }
  }
  return sampled ? inked / sampled : 0;
}

/** `STIMULUS_RECT_MM` grown by the D4 margin, in millimetres. */
const stimulusOtsuBand = (): RectMm => {
  const m = READER_THRESHOLDS.stimulusOtsuMarginMm;
  return {
    x: STIMULUS_RECT_MM.x - m,
    y: STIMULUS_RECT_MM.y - m,
    w: STIMULUS_RECT_MM.w + m * 2,
    h: STIMULUS_RECT_MM.h + m * 2,
  };
};

const shrink = (rect: RectMm, fraction: number): RectMm => ({
  x: rect.x + (rect.w * (1 - fraction)) / 2,
  y: rect.y + (rect.h * (1 - fraction)) / 2,
  w: rect.w * fraction,
  h: rect.h * fraction,
});

/** Pixel bounding box of a millimetre rect under `map`, clamped to the page. */
function pixelBounds(
  map: MapMm,
  rect: RectMm,
  width: number,
  height: number
): RectPx {
  const corners = [
    map({ x: rect.x, y: rect.y }),
    map({ x: rect.x + rect.w, y: rect.y }),
    map({ x: rect.x, y: rect.y + rect.h }),
    map({ x: rect.x + rect.w, y: rect.y + rect.h }),
  ];
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))));
  const x1 = Math.min(width, Math.ceil(Math.max(...corners.map((c) => c.x))));
  const y1 = Math.min(height, Math.ceil(Math.max(...corners.map((c) => c.y))));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Why a row produced no answer despite carrying ink (plan Q20). */
export type RowDoubt = 'multiple' | 'unclear';

export interface RowRead {
  /** 0-based row on this page. */
  indexOnPage: number;
  /** Marked choice index, or null when the row is blank or in doubt. */
  choice: number | null;
  /** Present only when ink was seen but no single answer could be trusted. */
  doubt?: RowDoubt;
  /** Fill ratio per choice, for review and threshold tuning. */
  fills: number[];
  /** Where the row sits on the source page, for the review crop. */
  crop: RectPx;
}

export interface PageRead {
  status: 'ok';
  marker: PaperMarkerPayload;
  /** The page was scanned upside down; everything above already accounts for it. */
  rotated: boolean;
  rows: RowRead[];
  registrationResidualMm: number;
  pxPerMm: number;
}

export interface PageReadFailure {
  status: 'no-registration' | 'no-marker';
}

export type PageReadResult = PageRead | PageReadFailure;

export interface ReadPageOptions {
  /** Questions in the whole test; fixes how many rows the last page carries. */
  questionCount: number;
  choiceCount: number;
  /**
   * Answer columns the batch was printed with; absent = 2. It comes from the
   * batch rather than the quiz, because a teacher can add or remove sheet
   * stimuli after a stack is already on desks (D2).
   */
  columnsPerPage?: PaperGrid;
}

/** Classify one row's fills into an answer, a blank, or a doubt. */
export function classifyRow(fills: readonly number[]): {
  choice: number | null;
  doubt?: RowDoubt;
} {
  // Untouched bubbles read ~0, so a mark is judged against its row, not an
  // absolute fill: pencil checks and Xs through a 1-bit scanner land at 0.1–0.4.
  const { mark, faint, dominance } = READER_THRESHOLDS;
  const sorted = [...fills].sort((a, b) => b - a);
  const top = sorted[0] ?? 0;
  const runnerUp = sorted[1] ?? 0;
  if (top < faint) return { choice: null };
  if (runnerUp >= faint && runnerUp >= top * dominance) {
    return { choice: null, doubt: 'multiple' };
  }
  if (top < mark) return { choice: null, doubt: 'unclear' };
  return { choice: fills.indexOf(top) };
}

/** Rows on `page` (1-based) of a test with `questionCount` questions. */
export function rowsOnPage(
  page: number,
  questionCount: number,
  columns: PaperGrid = DEFAULT_COLUMNS_PER_PAGE
): number {
  const perPage = questionsPerPage(columns);
  const first = (page - 1) * perPage;
  return Math.max(0, Math.min(perPage, questionCount - first));
}

export function readPaperPage(
  page: RasterPage,
  options: ReadPageOptions
): PageReadResult {
  const { width, height } = page;
  const columns = options.columnsPerPage ?? DEFAULT_COLUMNS_PER_PAGE;
  const gray = toGrayscale(page);
  const dark = thresholdGray(gray, otsuThreshold(gray, width, height));
  const marks = findRegistrationMarks(dark, width, height);
  if (!marks) return { status: 'no-registration' };
  const fit = fitAffine(
    marks.map((px, i) => ({ mm: REGISTRATION_MARK_CENTERS_MM[i], px }))
  );
  if (!fit) return { status: 'no-registration' };
  const pxPerMm = affineScalePxPerMm(fit.transform);
  const registrationResidualMm = fit.residualPx / pxPerMm;
  if (registrationResidualMm > READER_THRESHOLDS.maxRegistrationResidualMm) {
    return { status: 'no-registration' };
  }

  const upright: MapMm = (p) => applyAffine(fit.transform, p);
  const cellsUnder = (map: MapMm): boolean[] =>
    Array.from({ length: MARKER_CELL_COUNT }, (_, i) => {
      const cell = shrink(
        markerCellRectMm(i),
        1 - READER_THRESHOLDS.markerSampleInset
      );
      return (
        fillRatio(dark, width, height, map, cell, false) >=
        READER_THRESHOLDS.markerInked
      );
    });
  // Corner marks are symmetric, so an upside-down page fits the same transform
  // and only the marker can say so: look for it where a 180° turn would put it.
  const turned: MapMm = (p) =>
    upright({ x: PAGE_WIDTH_MM - p.x, y: PAGE_HEIGHT_MM - p.y });
  let rotated = false;
  let marker = decodePaperMarker(cellsUnder(upright));
  if (!marker) {
    marker = decodePaperMarker(cellsUnder(turned));
    rotated = true;
  }
  if (!marker) return { status: 'no-marker' };
  const map = rotated ? turned : upright;

  // D4. A stimulus on the right half would drag the page-wide Otsu cut up until
  // the grey choice letters read as marks; re-cut without that band.
  const bubbleDark =
    columns === 1
      ? thresholdGray(
          gray,
          otsuThreshold(
            gray,
            width,
            height,
            pixelBounds(map, stimulusOtsuBand(), width, height)
          )
        )
      : dark;

  const rows: RowRead[] = [];
  const count = rowsOnPage(marker.page, options.questionCount, columns);
  for (let i = 0; i < count; i += 1) {
    const fills = Array.from({ length: options.choiceCount }, (_, c) =>
      fillRatio(
        bubbleDark,
        width,
        height,
        map,
        shrink(
          bubbleRectMm(i, c, columns),
          READER_THRESHOLDS.bubbleSampleRadius
        ),
        true
      )
    );
    const rowRect = questionRowRectMm(i, options.choiceCount, columns);
    rows.push({
      indexOnPage: i,
      ...classifyRow(fills),
      fills,
      crop: pixelBounds(
        map,
        {
          x: rowRect.x - 2,
          y: rowRect.y - 1.5,
          w: rowRect.w + 4,
          h: rowRect.h + 3,
        },
        width,
        height
      ),
    });
  }

  return {
    status: 'ok',
    marker,
    rotated,
    rows,
    registrationResidualMm,
    pxPerMm,
  };
}
