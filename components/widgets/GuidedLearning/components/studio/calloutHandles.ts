import type { GuidedLearningStep } from '@/types';
import type { PxRect, StageGeometry } from '../../types/stage';
import type { Point } from '../../utils/calloutPlacement';

/** Side handles set the width; corner handles scale the whole card. Height fits the content, so no top or bottom handle. */
export type CalloutHandle = 'nw' | 'ne' | 'e' | 'se' | 'sw' | 'w';
export const CALLOUT_HANDLES: readonly CalloutHandle[] = [
  'nw',
  'ne',
  'e',
  'se',
  'sw',
  'w',
];

export const CALLOUT_WIDTH_MIN = 10;
export const CALLOUT_WIDTH_MAX = 95;
export const CALLOUT_SCALE_MIN = 0.75;
export const CALLOUT_SCALE_MAX = 2;
/** Keyboard steps: Alt+←/→ width in stage-%, Alt+↑/↓ scale. */
export const CALLOUT_WIDTH_STEP = 2;
export const CALLOUT_SCALE_STEP = 0.05;

// Phase A adds these to GuidedLearningStep; the intersection keeps this file compiling either way.
export type SizedStep = GuidedLearningStep & {
  calloutWidthPct?: number;
  calloutScale?: number;
};

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(Math.max(n, lo), hi);
const round = (n: number, places: number): number =>
  Math.round(n * 10 ** places) / 10 ** places;

export const clampWidthPct = (n: number): number =>
  round(clamp(n, CALLOUT_WIDTH_MIN, CALLOUT_WIDTH_MAX), 2);
export const clampScale = (n: number): number =>
  round(clamp(n, CALLOUT_SCALE_MIN, CALLOUT_SCALE_MAX), 3);

const OVERLAY_TYPES = new Set(['pan-zoom', 'pan-zoom-spotlight', 'spotlight']);

/** Steps whose tooltip or popover the Studio can select, resize and restyle; banners are out of scope. */
export function hasEditableCallout(step: GuidedLearningStep): boolean {
  if (step.interactionType === 'tooltip') return true;
  if (step.interactionType === 'text-popover') return true;
  return (
    OVERLAY_TYPES.has(step.interactionType) &&
    (step.showOverlay === 'tooltip' || step.showOverlay === 'popover')
  );
}

/** Tooltips draw a line to their target; popovers don't. */
export function isTooltipCallout(step: GuidedLearningStep): boolean {
  return (
    step.interactionType === 'tooltip' ||
    (OVERLAY_TYPES.has(step.interactionType) && step.showOverlay === 'tooltip')
  );
}

/** Result of a handle drag: the fields to write, and the new pinned centre in container px (null = leave the pin alone). */
export interface CalloutSizeEdit {
  widthPct?: number;
  scale?: number;
  centre: Point | null;
}

/** Side handle: the width follows the pointer; a pinned box keeps its opposite edge, an auto-placed one grows about its centre. */
export function resizeCalloutSide(
  start: PxRect,
  handle: 'e' | 'w',
  pointerX: number,
  stageW: number,
  pinned: boolean
): CalloutSizeEdit {
  const cx = start.x + start.w / 2;
  const anchor = handle === 'e' ? start.x : start.x + start.w;
  const rawW = pinned
    ? handle === 'e'
      ? pointerX - anchor
      : anchor - pointerX
    : 2 * Math.abs(pointerX - cx);
  const widthPct = clampWidthPct((rawW / Math.max(stageW, 1)) * 100);
  if (!pinned) return { widthPct, centre: null };
  const w = (widthPct / 100) * stageW;
  return {
    widthPct,
    centre: {
      x: handle === 'e' ? anchor + w / 2 : anchor - w / 2,
      y: start.y + start.h / 2,
    },
  };
}

const OPPOSITE: Record<'nw' | 'ne' | 'se' | 'sw', 'nw' | 'ne' | 'se' | 'sw'> = {
  nw: 'se',
  ne: 'sw',
  se: 'nw',
  sw: 'ne',
};

function corner(r: PxRect, c: 'nw' | 'ne' | 'se' | 'sw'): Point {
  return {
    x: c.includes('w') ? r.x : r.x + r.w,
    y: c.includes('n') ? r.y : r.y + r.h,
  };
}

/** Corner handle: scales text, padding and any set width together, anchored at the opposite corner. */
export function scaleCalloutCorner(
  start: PxRect,
  handle: 'nw' | 'ne' | 'se' | 'sw',
  pointer: Point,
  startScale: number,
  startWidthPct: number | undefined,
  pinned: boolean
): CalloutSizeEdit {
  const o = corner(start, OPPOSITE[handle]);
  const c = corner(start, handle);
  const vx = c.x - o.x;
  const vy = c.y - o.y;
  const len2 = vx * vx + vy * vy;
  const ratio =
    len2 === 0 ? 1 : ((pointer.x - o.x) * vx + (pointer.y - o.y) * vy) / len2;
  const scale = clampScale(startScale * ratio);
  const r = scale / startScale;
  const edit: CalloutSizeEdit = { scale, centre: null };
  if (startWidthPct !== undefined) {
    edit.widthPct = clampWidthPct(startWidthPct * r);
  }
  if (pinned) {
    edit.centre = {
      x: o.x + (start.x + start.w / 2 - o.x) * r,
      y: o.y + (start.y + start.h / 2 - o.y) * r,
    };
  }
  return edit;
}

/** Writes width and scale, dropping either when it returns to its default. */
export function withCalloutSize(
  step: SizedStep,
  size: { widthPct?: number; scale?: number }
): SizedStep {
  const next: SizedStep = { ...step };
  if (size.widthPct !== undefined) {
    next.calloutWidthPct = clampWidthPct(size.widthPct);
  }
  if (size.scale !== undefined) {
    const s = clampScale(size.scale);
    if (s === 1) delete next.calloutScale;
    else next.calloutScale = s;
  }
  return next;
}

/** A client rect in stage container px, through the stage's own pointer conversion. */
export function clientRectToContainer(g: StageGeometry, r: DOMRect): PxRect {
  const a = g.imagePctToContainerPx(g.clientToImagePct(r.left, r.top));
  const b = g.imagePctToContainerPx(g.clientToImagePct(r.right, r.bottom));
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/** Where a tooltip's line meets its target: the target point nearest the box's closest edge. */
export function leaderEnd(box: PxRect, target: PxRect): Point {
  const near = (p: Point, r: PxRect): Point => ({
    x: clamp(p.x, r.x, r.x + r.w),
    y: clamp(p.y, r.y, r.y + r.h),
  });
  const from = near(
    { x: target.x + target.w / 2, y: target.y + target.h / 2 },
    box
  );
  return near(from, target);
}
