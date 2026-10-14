import type {
  WhiteboardInkStroke,
  WhiteboardPlacedImage,
  WhiteboardStartingImage,
  WhiteboardStartingPage,
} from '@/types';
import { driveImageUrl } from '@/utils/quizStimuli';
import { paintBackground } from '@/components/widgets/DrawingWidget/backgroundTemplates';
import {
  WHITEBOARD_BITMAP_SCALE,
  WHITEBOARD_PAGE,
} from '@/components/quiz/whiteboard/whiteboardLogTypes';
import {
  WHITEBOARD_INK_STROKES_MAX,
  WHITEBOARD_POLYGON_SIDES_MAX,
  WHITEBOARD_POLYGON_SIDES_MIN,
  WHITEBOARD_STARTING_IMAGES_MAX,
} from '@/config/quizRecordingDefaults';

// Paints a whiteboard starting page (D6, D7) in page units; callers scale the context for the 2x bitmap.

export { WHITEBOARD_BITMAP_SCALE };
export const WHITEBOARD_PAGE_WIDTH = WHITEBOARD_PAGE.w;
export const WHITEBOARD_PAGE_HEIGHT = WHITEBOARD_PAGE.h;

// Matches the number-line tick cap in normalizeWhiteboardStartingPage.
export const NUMBER_LINE_MAX_TICKS = 100;

const PAGE_FILL = '#ffffff';
const INK = '#334155';
const GRID_INK = 'rgba(148, 163, 184, 0.45)';
const LABEL_FONT = '500 22px "Lexend", sans-serif';
const PLANE_MARGIN = 72;
const NUMBER_LINE_MARGIN = 120;
const MAX_LABELS_PER_AXIS = 20;

type Pattern = WhiteboardStartingPage['pattern'];

export type StartingPageIssue =
  | 'x-range'
  | 'y-range'
  | 'number-line-range'
  | 'number-line-step'
  | 'too-many-ticks'
  | 'shape-sides';

const isNum = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

export const startingPageIssues = (
  spec: WhiteboardStartingPage
): StartingPageIssue[] => {
  const p = spec.pattern;
  const issues: StartingPageIssue[] = [];
  if (p.kind === 'coordinate-plane') {
    const xOk = isNum(p.xMin) && isNum(p.xMax) && p.xMin < p.xMax;
    const yOk = isNum(p.yMin) && isNum(p.yMax) && p.yMin < p.yMax;
    if (!xOk) issues.push('x-range');
    if (!yOk) issues.push('y-range');
  } else if (p.kind === 'number-line') {
    const rangeOk = isNum(p.min) && isNum(p.max) && p.min < p.max;
    const stepOk = isNum(p.step) && p.step > 0;
    if (!rangeOk) issues.push('number-line-range');
    if (!stepOk) issues.push('number-line-step');
    if (
      rangeOk &&
      stepOk &&
      (p.max - p.min) / p.step > NUMBER_LINE_MAX_TICKS + 1e-9
    )
      issues.push('too-many-ticks');
  } else if (p.kind === 'shape' && p.shape === 'polygon') {
    const s = p.sides;
    if (
      s !== undefined &&
      (!Number.isInteger(s) ||
        s < WHITEBOARD_POLYGON_SIDES_MIN ||
        s > WHITEBOARD_POLYGON_SIDES_MAX)
    )
      issues.push('shape-sides');
  }
  return issues;
};

// Canonical JSON (sorted keys) so the id does not depend on property order.
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${canonical(val)}`).join(',')}}`;
  }
  return JSON.stringify(v);
};

// FNV-1a over the canonical spec; stable across sessions and devices (D7).
export const startingPageId = (spec: WhiteboardStartingPage): string => {
  const text = canonical(spec);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `sp1_${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

// Picks 1, 2 or 5 times a power of ten so an axis carries at most `maxLabels` labels.
export const niceStep = (span: number, maxLabels: number): number => {
  if (!(span > 0)) return 1;
  const raw = span / maxLabels;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= raw) return m * pow;
  }
  return 10 * pow;
};

// Whole-number ranges never get half-unit grid lines.
const axisStep = (min: number, max: number): number => {
  const step = niceStep(max - min, MAX_LABELS_PER_AXIS);
  return Number.isInteger(min) && Number.isInteger(max)
    ? Math.max(1, step)
    : step;
};

const formatTick = (n: number): string => {
  const rounded = Math.round(n * 1e6) / 1e6;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

const ticksBetween = (min: number, max: number, step: number): number[] => {
  const out: number[] = [];
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  for (let i = first; i <= last; i++) out.push(i * step);
  return out;
};

const drawArrowHead = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number
): void => {
  const len = 18;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x - len * Math.cos(angle - Math.PI / 7),
    y - len * Math.sin(angle - Math.PI / 7)
  );
  ctx.lineTo(
    x - len * Math.cos(angle + Math.PI / 7),
    y - len * Math.sin(angle + Math.PI / 7)
  );
  ctx.closePath();
  ctx.fill();
};

const drawCoordinatePlane = (
  ctx: CanvasRenderingContext2D,
  p: Extract<Pattern, { kind: 'coordinate-plane' }>
): void => {
  const w = WHITEBOARD_PAGE_WIDTH;
  const h = WHITEBOARD_PAGE_HEIGHT;
  const left = PLANE_MARGIN;
  const right = w - PLANE_MARGIN;
  const top = PLANE_MARGIN;
  const bottom = h - PLANE_MARGIN;
  const sx = (right - left) / (p.xMax - p.xMin);
  const sy = (bottom - top) / (p.yMax - p.yMin);
  const toX = (x: number) => left + (x - p.xMin) * sx;
  const toY = (y: number) => bottom - (y - p.yMin) * sy;

  const xStep = axisStep(p.xMin, p.xMax);
  const yStep = axisStep(p.yMin, p.yMax);
  const xTicks = ticksBetween(p.xMin, p.xMax, xStep);
  const yTicks = ticksBetween(p.yMin, p.yMax, yStep);

  ctx.strokeStyle = GRID_INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of xTicks) {
    ctx.moveTo(toX(x), top);
    ctx.lineTo(toX(x), bottom);
  }
  for (const y of yTicks) {
    ctx.moveTo(left, toY(y));
    ctx.lineTo(right, toY(y));
  }
  ctx.stroke();

  // Axes sit at zero when zero is in range, otherwise on the nearest edge.
  const axisX = toX(Math.min(Math.max(0, p.xMin), p.xMax));
  const axisY = toY(Math.min(Math.max(0, p.yMin), p.yMax));
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.xMin < 0 ? left - 24 : left, axisY);
  ctx.lineTo(right + 24, axisY);
  ctx.moveTo(axisX, p.yMin < 0 ? bottom + 24 : bottom);
  ctx.lineTo(axisX, top - 24);
  ctx.stroke();
  drawArrowHead(ctx, right + 32, axisY, 0);
  // A first-quadrant plane has no arrows pointing into negative numbers.
  if (p.xMin < 0) drawArrowHead(ctx, left - 32, axisY, Math.PI);
  drawArrowHead(ctx, axisX, top - 32, -Math.PI / 2);
  if (p.yMin < 0) drawArrowHead(ctx, axisX, bottom + 32, Math.PI / 2);

  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const x of xTicks) {
    if (x === 0 && axisX === toX(0)) continue;
    ctx.fillText(formatTick(x), toX(x), axisY + 10);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const y of yTicks) {
    if (y === 0 && axisY === toY(0)) continue;
    ctx.fillText(formatTick(y), axisX - 10, toY(y));
  }
  if (axisX === toX(0) && axisY === toY(0)) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('0', axisX - 8, axisY + 8);
  }
};

// Smallest 1, 2, 5, 10... stride that keeps a number line at 21 labels or fewer.
const labelStride = (tickCount: number): number => {
  for (let pow = 1; ; pow *= 10) {
    for (const m of [1, 2, 5]) {
      if (Math.ceil(tickCount / (m * pow)) <= MAX_LABELS_PER_AXIS + 1)
        return m * pow;
    }
  }
};

const drawNumberLine = (
  ctx: CanvasRenderingContext2D,
  p: Extract<Pattern, { kind: 'number-line' }>
): void => {
  const left = NUMBER_LINE_MARGIN;
  const right = WHITEBOARD_PAGE_WIDTH - NUMBER_LINE_MARGIN;
  const y = WHITEBOARD_PAGE_HEIGHT / 2;
  const scale = (right - left) / (p.max - p.min);
  const toX = (v: number) => left + (v - p.min) * scale;
  const ticks = ticksBetween(p.min, p.max, p.step);
  const labelEvery = labelStride(ticks.length);

  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left - 40, y);
  ctx.lineTo(right + 40, y);
  ctx.stroke();
  drawArrowHead(ctx, right + 56, y, 0);
  drawArrowHead(ctx, left - 56, y, Math.PI);

  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ticks.forEach((v, i) => {
    const labelled = i % labelEvery === 0;
    const half = labelled ? 18 : 10;
    ctx.beginPath();
    ctx.moveTo(toX(v), y - half);
    ctx.lineTo(toX(v), y + half);
    ctx.stroke();
    if (labelled) ctx.fillText(formatTick(v), toX(v), y + 28);
  });
};

const regularPolygon = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  sides: number
): void => {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    // Start at the top so a triangle points up and an even polygon sits flat.
    const a =
      -Math.PI / 2 +
      (i * 2 * Math.PI) / sides +
      (sides % 2 === 0 ? Math.PI / sides : 0);
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
};

const drawShape = (
  ctx: CanvasRenderingContext2D,
  p: Extract<Pattern, { kind: 'shape' }>
): void => {
  const cx = WHITEBOARD_PAGE_WIDTH / 2;
  const cy = WHITEBOARD_PAGE_HEIGHT / 2;
  const r = WHITEBOARD_PAGE_HEIGHT * 0.36;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  switch (p.shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case 'rectangle': {
      const rw = WHITEBOARD_PAGE_WIDTH * 0.6;
      const rh = WHITEBOARD_PAGE_HEIGHT * 0.6;
      ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);
      return;
    }
    case 'triangle':
      // Lift an up-pointing triangle so its bounding box is centred on the page.
      regularPolygon(ctx, cx, cy + (r * 1.15) / 4, r * 1.15, 3);
      return;
    case 'polygon':
      regularPolygon(ctx, cx, cy, r, p.sides ?? 5);
      return;
  }
};

export interface FitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Whole image, centred, never cropped (D6).
export const fitImageToPage = (iw: number, ih: number): FitRect | null => {
  if (!(iw > 0) || !(ih > 0)) return null;
  const s = Math.min(WHITEBOARD_PAGE_WIDTH / iw, WHITEBOARD_PAGE_HEIGHT / ih);
  const w = iw * s;
  const h = ih * s;
  return {
    x: (WHITEBOARD_PAGE_WIDTH - w) / 2,
    y: (WHITEBOARD_PAGE_HEIGHT - h) / 2,
    w,
    h,
  };
};

/** Decoded starting page images, keyed by `driveFileId`. */
export type StartingPageImages = ReadonlyMap<string, CanvasImageSource>;

// A data: URL only comes from dev fixtures; stored pages always load from Drive.
export const startingImageSrc = (image: WhiteboardStartingImage): string =>
  image.url.startsWith('data:') ? image.url : driveImageUrl(image.driveFileId);

/** The page's images in paint order; a legacy single image becomes one fitted placement. */
export const placedImages = (
  spec: WhiteboardStartingPage | null | undefined
): WhiteboardPlacedImage[] => {
  if (!spec) return [];
  if (spec.images) return spec.images.slice(0, WHITEBOARD_STARTING_IMAGES_MAX);
  if (!spec.image) return [];
  const rect = fitImageToPage(spec.image.width, spec.image.height);
  return rect ? [{ ...spec.image, ...rect }] : [];
};

/** Paints teacher ink strokes in page units with round caps and joins. */
export const drawStartingInk = (
  ctx: CanvasRenderingContext2D,
  ink: readonly WhiteboardInkStroke[] | undefined
): void => {
  if (!ink || ink.length === 0) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of ink.slice(0, WHITEBOARD_INK_STROKES_MAX)) {
    const pts = stroke.points;
    if (pts.length < 2) continue;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    if (pts.length < 4) {
      ctx.beginPath();
      ctx.arc(pts[0], pts[1], stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }
};

// Paints in 1600x1200 page units: white fill, images, the pattern, then teacher ink on top.
export const drawStartingPage = (
  ctx: CanvasRenderingContext2D,
  spec: WhiteboardStartingPage,
  images?: StartingPageImages | null
): void => {
  ctx.save();
  ctx.fillStyle = PAGE_FILL;
  ctx.fillRect(0, 0, WHITEBOARD_PAGE_WIDTH, WHITEBOARD_PAGE_HEIGHT);

  if (images && images.size > 0) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    for (const placed of placedImages(spec)) {
      const source = images.get(placed.driveFileId);
      if (source) ctx.drawImage(source, placed.x, placed.y, placed.w, placed.h);
    }
  }

  const p = spec.pattern;
  // An invalid range or step paints nothing rather than a misleading axis.
  if (startingPageIssues(spec).length === 0) {
    switch (p.kind) {
      case 'blank':
        break;
      case 'grid':
      case 'lines':
      case 'dots':
        paintBackground(
          ctx,
          p.kind,
          WHITEBOARD_PAGE_WIDTH,
          WHITEBOARD_PAGE_HEIGHT
        );
        break;
      case 'coordinate-plane':
        drawCoordinatePlane(ctx, p);
        break;
      case 'number-line':
        drawNumberLine(ctx, p);
        break;
      case 'shape':
        drawShape(ctx, p);
        break;
    }
  }
  drawStartingInk(ctx, spec.ink);
  ctx.restore();
};

// Allocates a 3200x2400 canvas with the starting page painted at 2x.
export const renderStartingPageCanvas = (
  spec: WhiteboardStartingPage,
  images?: StartingPageImages | null,
  scale: number = WHITEBOARD_BITMAP_SCALE
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = WHITEBOARD_PAGE_WIDTH * scale;
  canvas.height = WHITEBOARD_PAGE_HEIGHT * scale;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawStartingPage(ctx, spec, images);
  }
  return canvas;
};
