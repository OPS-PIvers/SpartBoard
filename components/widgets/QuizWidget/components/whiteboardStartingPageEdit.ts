import type {
  WhiteboardInkStroke,
  WhiteboardPlacedImage,
  WhiteboardStartingImage,
  WhiteboardStartingPage,
} from '@/types';
import {
  clampPlacedRect,
  WHITEBOARD_INK_POINTS_MAX,
  WHITEBOARD_INK_STROKES_MAX,
} from '@/config/quizRecordingDefaults';
import {
  WHITEBOARD_PAGE_HEIGHT as H,
  WHITEBOARD_PAGE_WIDTH as W,
} from '@/utils/whiteboard/startingPage';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

const DEFAULT_FIT = 0.6;
const CASCADE_STEP = 48;
const MIN_IMAGE_SIZE = 40;
const MIN_POINT_GAP = 6;
export const TEACHER_INK_COLOR = '#0f172a';
export const TEACHER_INK_SIZE = 4;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Centred, fitted within 60% of the page, and cascaded down-right by its index. */
export function defaultImagePlacement(
  image: WhiteboardStartingImage,
  index: number
): WhiteboardPlacedImage {
  const s = Math.min(
    (W * DEFAULT_FIT) / Math.max(1, image.width),
    (H * DEFAULT_FIT) / Math.max(1, image.height)
  );
  const w = Math.round(image.width * s);
  const h = Math.round(image.height * s);
  const offset = (index % 6) * CASCADE_STEP;
  return clampPlacedRect({
    ...image,
    w,
    h,
    x: Math.round((W - w) / 2 + offset),
    y: Math.round((H - h) / 2 + offset),
  });
}

/** Moves a rect by a delta and keeps it wholly on the page. */
export function moveRect<T extends Rect>(rect: T, dx: number, dy: number): T {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, W - rect.w),
    y: clamp(rect.y + dy, 0, H - rect.h),
  };
}

/** Resizes from a dragged corner with the opposite corner fixed, keeping aspect ratio and the page bounds. */
export function resizeFromCorner<T extends Rect>(
  rect: T,
  corner: Corner,
  px: number,
  py: number
): T {
  const east = corner === 'ne' || corner === 'se';
  const south = corner === 'sw' || corner === 'se';
  const ax = east ? rect.x : rect.x + rect.w;
  const ay = south ? rect.y : rect.y + rect.h;
  const wantW = east ? px - ax : ax - px;
  const wantH = south ? py - ay : ay - py;
  const minS = MIN_IMAGE_SIZE / Math.min(rect.w, rect.h);
  const maxS = Math.min(
    (east ? W - ax : ax) / rect.w,
    (south ? H - ay : ay) / rect.h
  );
  const s = clamp(Math.max(wantW / rect.w, wantH / rect.h), minS, maxS);
  const w = rect.w * s;
  const h = rect.h * s;
  return {
    ...rect,
    w,
    h,
    x: east ? ax : ax - w,
    y: south ? ay : ay - h,
  };
}

/** Topmost image under the point, or -1. */
export function hitImage(images: readonly Rect[], x: number, y: number) {
  for (let i = images.length - 1; i >= 0; i--) {
    const r = images[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

export const cornerPoint = (r: Rect, c: Corner): [number, number] => [
  c === 'ne' || c === 'se' ? r.x + r.w : r.x,
  c === 'sw' || c === 'se' ? r.y + r.h : r.y,
];

export const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

/** The corner handle within `radius` of the point, if any. */
export function hitCorner(
  rect: Rect,
  x: number,
  y: number,
  radius: number
): Corner | null {
  for (const c of CORNERS) {
    const [cx, cy] = cornerPoint(rect, c);
    if (Math.hypot(x - cx, y - cy) <= radius) return c;
  }
  return null;
}

const segmentDistance = (
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : clamp(((x - x1) * dx + (y - y1) * dy) / len, 0, 1);
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
};

/** True when the point is within `radius` of the stroke's line. */
export function strokeHit(
  stroke: WhiteboardInkStroke,
  x: number,
  y: number,
  radius: number
): boolean {
  const p = stroke.points;
  const reach = radius + stroke.size / 2;
  if (p.length < 4) return Math.hypot(x - p[0], y - p[1]) <= reach;
  for (let i = 0; i + 3 < p.length; i += 2) {
    if (segmentDistance(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= reach) {
      return true;
    }
  }
  return false;
}

export const inkPointCount = (ink: readonly WhiteboardInkStroke[]) =>
  ink.reduce((n, s) => n + s.points.length / 2, 0);

/** Whether another stroke may start under the stroke and point caps. */
export const canStartStroke = (ink: readonly WhiteboardInkStroke[]) =>
  ink.length < WHITEBOARD_INK_STROKES_MAX &&
  inkPointCount(ink) < WHITEBOARD_INK_POINTS_MAX;

/** Adds a rounded, on-page point unless it is too close to the last one or the point cap is hit. */
export function appendInkPoint(
  points: readonly number[],
  x: number,
  y: number,
  budget: number
): number[] {
  if (points.length / 2 >= budget) return points as number[];
  const px = Math.round(clamp(x, 0, W));
  const py = Math.round(clamp(y, 0, H));
  const n = points.length;
  if (
    n >= 2 &&
    Math.hypot(px - points[n - 2], py - points[n - 1]) < MIN_POINT_GAP
  ) {
    return points as number[];
  }
  return [...points, px, py];
}

/** A page written by the editor: `images` replaces the legacy `image`, empty lists are omitted. */
export function withEdits(
  page: WhiteboardStartingPage,
  images: WhiteboardPlacedImage[],
  ink: WhiteboardInkStroke[]
): WhiteboardStartingPage {
  const next: WhiteboardStartingPage = { pattern: page.pattern };
  if (images.length > 0) next.images = images;
  if (ink.length > 0) next.ink = ink;
  return next;
}
