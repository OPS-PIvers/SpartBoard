// Pure millimetre geometry for markup items: drawing, clamping, moving, resizing and saving.
import type {
  PaperImageMarkup,
  PaperMarkupItem,
  PaperPointMm,
  PaperRectMm,
} from '@/types';
import { MIN_SHAPE_MM, pointItemRadiusMm } from './markupStyle';

export type RectMarkupItem = Extract<PaperMarkupItem, { rectMm: PaperRectMm }>;
export type PointMarkupItem = Extract<PaperMarkupItem, { atMm: PaperPointMm }>;
export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

export const isRectItem = (item: PaperMarkupItem): item is RectMarkupItem =>
  item.kind === 'highlight' || item.kind === 'rect' || item.kind === 'ellipse';

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

const round = (v: number) => Math.round(v * 100) / 100;

export const roundRectMm = (r: PaperRectMm): PaperRectMm => ({
  x: round(r.x),
  y: round(r.y),
  w: round(r.w),
  h: round(r.h),
});

export const clampPoint = (
  p: PaperPointMm,
  view: PaperRectMm,
  inset = 0
): PaperPointMm => ({
  x: clamp(p.x, view.x + inset, view.x + view.w - inset),
  y: clamp(p.y, view.y + inset, view.y + view.h - inset),
});

/** The rect two drag corners span, kept inside the viewport. */
export function rectFromCorners(
  a: PaperPointMm,
  b: PaperPointMm,
  view: PaperRectMm
): PaperRectMm {
  const p = clampPoint(a, view);
  const q = clampPoint(b, view);
  return {
    x: Math.min(p.x, q.x),
    y: Math.min(p.y, q.y),
    w: Math.abs(p.x - q.x),
    h: Math.abs(p.y - q.y),
  };
}

export const isBigEnough = (r: PaperRectMm): boolean =>
  r.w >= MIN_SHAPE_MM && r.h >= MIN_SHAPE_MM;

/** Where a stamp or pin lands so its whole glyph stays on the crop. */
export const placePoint = (
  p: PaperPointMm,
  kind: 'stamp' | 'pin',
  view: PaperRectMm
): PaperPointMm => {
  const at = clampPoint(p, view, pointItemRadiusMm(kind));
  return { x: round(at.x), y: round(at.y) };
};

/** Bounds of an item in millimetres. */
export function itemBoundsMm(item: PaperMarkupItem): PaperRectMm {
  if (isRectItem(item)) return item.rectMm;
  const r = pointItemRadiusMm(item.kind);
  return { x: item.atMm.x - r, y: item.atMm.y - r, w: r * 2, h: r * 2 };
}

/** The item shifted by `d`, stopped at the viewport edge. */
export function moveItem(
  item: PaperMarkupItem,
  d: PaperPointMm,
  view: PaperRectMm
): PaperMarkupItem {
  if (isRectItem(item)) {
    const r = item.rectMm;
    const x = clamp(r.x + d.x, view.x, view.x + view.w - r.w);
    const y = clamp(r.y + d.y, view.y, view.y + view.h - r.h);
    return { ...item, rectMm: roundRectMm({ x, y, w: r.w, h: r.h }) };
  }
  return {
    ...item,
    atMm: placePoint(
      { x: item.atMm.x + d.x, y: item.atMm.y + d.y },
      item.kind,
      view
    ),
  };
}

const OPPOSITE: Record<ResizeCorner, (r: PaperRectMm) => PaperPointMm> = {
  nw: (r) => ({ x: r.x + r.w, y: r.y + r.h }),
  ne: (r) => ({ x: r.x, y: r.y + r.h }),
  sw: (r) => ({ x: r.x + r.w, y: r.y }),
  se: (r) => ({ x: r.x, y: r.y }),
};

/** A rect item with `corner` dragged to `p`; never smaller than the minimum or off the crop. */
export function resizeItem(
  item: RectMarkupItem,
  corner: ResizeCorner,
  p: PaperPointMm,
  view: PaperRectMm
): RectMarkupItem {
  const fixed = OPPOSITE[corner](item.rectMm);
  const q = clampPoint(p, view);
  const west = corner === 'nw' || corner === 'sw';
  const north = corner === 'nw' || corner === 'ne';
  const x = west
    ? Math.min(q.x, fixed.x - MIN_SHAPE_MM)
    : Math.max(q.x, fixed.x + MIN_SHAPE_MM);
  const y = north
    ? Math.min(q.y, fixed.y - MIN_SHAPE_MM)
    : Math.max(q.y, fixed.y + MIN_SHAPE_MM);
  return {
    ...item,
    rectMm: roundRectMm(rectFromCorners(fixed, { x, y }, view)),
  };
}

let idCounter = 0;
export const newMarkupId = (): string =>
  `mk${Date.now().toString(36)}${(idCounter++).toString(36)}`;

const sameItem = (a: PaperMarkupItem, b: PaperMarkupItem): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export function markupItemsEqual(
  a: readonly PaperMarkupItem[],
  b: readonly PaperMarkupItem[] | undefined
): boolean {
  const right = b ?? [];
  return a.length === right.length && a.every((x, i) => sameItem(x, right[i]));
}

/** What a save writes to `imageMarkup`; untouched markup is kept as saved so it keeps its scan (K12). */
export function imageMarkupForSave(args: {
  editable: boolean;
  saved: PaperImageMarkup | undefined;
  items: readonly PaperMarkupItem[];
  scanId: string | undefined;
  page: number | undefined;
}): PaperImageMarkup | undefined {
  const { editable, saved, items, scanId, page } = args;
  if (!editable || !scanId || page === undefined) return saved;
  if (markupItemsEqual(items, saved?.items)) return saved;
  if (items.length === 0) return undefined;
  return { scanId, page, items: [...items] };
}
