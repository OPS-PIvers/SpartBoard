import type { Point } from '@/types';
import type { BoundingBox } from './hitTest';

const ANGLE_STEP = Math.PI / 12;

/** Shift while drawing a rect or ellipse: the far corner moves to make a square. */
export const squareCorner = (start: Point, end: Point): Point => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + (dx < 0 ? -side : side),
    y: start.y + (dy < 0 ? -side : side),
  };
};

/** Shift while drawing a line or arrow: the end snaps to the nearest 15°, keeping its length. */
export const snapLineEnd = (start: Point, end: Point): Point => {
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  if (len === 0) return end;
  const angle =
    Math.round(Math.atan2(end.y - start.y, end.x - start.x) / ANGLE_STEP) *
    ANGLE_STEP;
  // Rounded so horizontal and vertical lines land on whole pixels.
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    x: round(start.x + len * Math.cos(angle)),
    y: round(start.y + len * Math.sin(angle)),
  };
};

/** Shift while rotating: whole 15° steps. */
export const snapRotation = (rotation: number): number =>
  Math.round(rotation / ANGLE_STEP) * ANGLE_STEP;

export interface AlignmentGuide {
  axis: 'x' | 'y';
  /** Page px of the guide line. */
  at: number;
  from: number;
  to: number;
}

const xStops = (b: BoundingBox) => [b.x, b.x + b.w / 2, b.x + b.w];
const yStops = (b: BoundingBox) => [b.y, b.y + b.h / 2, b.y + b.h];

const nearest = (
  moving: number[],
  targets: number[],
  threshold: number
): number | null => {
  let best: number | null = null;
  for (const m of moving) {
    for (const t of targets) {
      const d = t - m;
      if (
        Math.abs(d) <= threshold &&
        (best === null || Math.abs(d) < Math.abs(best))
      ) {
        best = d;
      }
    }
  }
  return best;
};

/**
 * Snaps a dragged box's edges and centre to other boxes and the page, and
 * returns the offset to add plus the guides to draw.
 */
export const snapToGuides = (
  moving: BoundingBox,
  others: readonly BoundingBox[],
  page: { width: number; height: number },
  threshold: number
): { dx: number; dy: number; guides: AlignmentGuide[] } => {
  const pageBox: BoundingBox = { x: 0, y: 0, w: page.width, h: page.height };
  const boxes = [...others, pageBox];
  const dx = nearest(xStops(moving), boxes.flatMap(xStops), threshold) ?? 0;
  const dy = nearest(yStops(moving), boxes.flatMap(yStops), threshold) ?? 0;
  const snapped: BoundingBox = {
    ...moving,
    x: moving.x + dx,
    y: moving.y + dy,
  };
  const guides: AlignmentGuide[] = [];
  const close = (a: number, b: number) => Math.abs(a - b) < 0.5;

  const addGuides = (axis: 'x' | 'y') => {
    const stops = axis === 'x' ? xStops : yStops;
    const span = (b: BoundingBox): [number, number] =>
      axis === 'x' ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
    for (const at of stops(snapped)) {
      const matches = boxes.filter((b) => stops(b).some((s) => close(s, at)));
      if (matches.length === 0) continue;
      const ranges = [span(snapped), ...matches.map(span)];
      guides.push({
        axis,
        at,
        from: Math.min(...ranges.map((r) => r[0])),
        to: Math.max(...ranges.map((r) => r[1])),
      });
    }
  };
  addGuides('x');
  addGuides('y');
  return { dx, dy, guides };
};
