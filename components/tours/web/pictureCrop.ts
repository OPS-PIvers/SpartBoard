import type { TourMarkupShape, WebTourPicture } from '@/types';

/** A rectangle as 0-1 fractions of some picture. */
export interface UnitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL: UnitRect = { x: 0, y: 0, w: 1, h: 1 };
/** Smallest crop side, as a fraction of the picture it is cut from. */
export const MIN_CROP = 0.05;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** A point in the picture, as a point in the base it was cut from. */
const pointToBase = (x: number, y: number, crop: UnitRect) => ({
  x: crop.x + x * crop.w,
  y: crop.y + y * crop.h,
});

/** A point in the base, as a point in a crop of it. */
const pointFromBase = (x: number, y: number, crop: UnitRect) => ({
  x: (x - crop.x) / crop.w,
  y: (y - crop.y) / crop.h,
});

/** Moves a rect from one crop of a base into another; null when none of it is left. */
export function moveRect(
  r: UnitRect,
  from: UnitRect,
  to: UnitRect
): UnitRect | null {
  const a = pointToBase(r.x, r.y, from);
  const b = pointToBase(r.x + r.w, r.y + r.h, from);
  const p = pointFromBase(a.x, a.y, to);
  const q = pointFromBase(b.x, b.y, to);
  const x1 = clamp(p.x);
  const y1 = clamp(p.y);
  const x2 = clamp(q.x);
  const y2 = clamp(q.y);
  if (x2 - x1 <= 0.0001 || y2 - y1 <= 0.0001) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

const inside = (x: number, y: number) => x >= 0 && x <= 1 && y >= 0 && y <= 1;

/** Moves markup shapes from one crop into another; shapes that fall outside are dropped. */
export function moveMarkup(
  shapes: readonly TourMarkupShape[],
  from: UnitRect,
  to: UnitRect
): TourMarkupShape[] {
  const point = (x: number, y: number) => {
    const b = pointToBase(x, y, from);
    return pointFromBase(b.x, b.y, to);
  };
  return shapes.flatMap((s): TourMarkupShape[] => {
    if (s.kind === 'box') {
      const r = moveRect(s, from, to);
      return r ? [{ ...s, ...r }] : [];
    }
    if (s.kind === 'number') {
      const p = point(s.x, s.y);
      return inside(p.x, p.y) ? [{ ...s, x: p.x, y: p.y }] : [];
    }
    const a = point(s.x1, s.y1);
    const b = point(s.x2, s.y2);
    if (!inside(a.x, a.y) && !inside(b.x, b.y)) return [];
    return [
      {
        ...s,
        x1: clamp(a.x),
        y1: clamp(a.y),
        x2: clamp(b.x),
        y2: clamp(b.y),
      },
    ];
  });
}

/** Where the current picture sits in what Crop can widen to: its capture, else itself (tighter only). */
export const cropBase = (picture: WebTourPicture): UnitRect =>
  picture.original ? picture.original.crop : FULL;

/** Keeps a crop inside its base and no smaller than MIN_CROP. */
export function clampCrop(r: UnitRect): UnitRect {
  const w = clamp(r.w, MIN_CROP, 1);
  const h = clamp(r.h, MIN_CROP, 1);
  return { x: clamp(r.x, 0, 1 - w), y: clamp(r.y, 0, 1 - h), w, h };
}

/** The picture after a crop to `next` (0-1 of its base), saved as `file`: ring, markup and scale follow it. */
export function recropPicture(
  picture: WebTourPicture,
  next: UnitRect,
  file: { path: string; w: number; h: number }
): WebTourPicture {
  const from = cropBase(picture);
  const target = picture.target ? moveRect(picture.target, from, next) : null;
  const markup = picture.markup ? moveMarkup(picture.markup, from, next) : [];
  const out: WebTourPicture = { path: file.path, w: file.w, h: file.h };
  if (target) out.target = target;
  if (picture.cssW) out.cssW = (picture.cssW * next.w) / from.w;
  if (picture.original) out.original = { ...picture.original, crop: next };
  if (markup.length > 0) out.markup = markup;
  return out;
}
