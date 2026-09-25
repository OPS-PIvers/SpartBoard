import type { GuidedLearningCalloutBox, GuidedLearningStep } from '@/types';
import type { PxRect, StageGeometry } from '../../types/stage';
import type { Point } from '../../utils/calloutPlacement';
import type { ResizeHandle } from './regionEdits';

/** Eight handles: corners and edge midpoints (G6). */
export type CalloutHandle = ResizeHandle;
export const CALLOUT_HANDLES: readonly CalloutHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

/** Smallest box a handle drag may leave, in container px. */
export const CALLOUT_MIN_PX = { w: 48, h: 28 };
/** Alt+arrows grow or shrink the box by this many image-% per press. */
export const CALLOUT_NUDGE_PCT = 1;

const clamp = (n: number, lo: number, hi: number): number =>
  hi < lo ? lo : Math.min(Math.max(n, lo), hi);

const OVERLAY_TYPES = new Set(['pan-zoom', 'pan-zoom-spotlight', 'spotlight']);

/** Tooltips draw a line to their target; popovers don't. */
export function isTooltipCallout(step: GuidedLearningStep): boolean {
  return (
    step.interactionType === 'tooltip' ||
    (OVERLAY_TYPES.has(step.interactionType) && step.showOverlay === 'tooltip')
  );
}

/** Tooltip ⇄ popover, keeping label, text, box and tone. */
export function toggleCalloutKind(
  step: GuidedLearningStep
): GuidedLearningStep {
  if (step.interactionType === 'tooltip') {
    return { ...step, interactionType: 'text-popover' };
  }
  if (step.interactionType === 'text-popover') {
    return { ...step, interactionType: 'tooltip' };
  }
  return {
    ...step,
    showOverlay: step.showOverlay === 'tooltip' ? 'popover' : 'tooltip',
  };
}

export interface BoxResizeOptions {
  /** Shift: keep the starting aspect ratio. */
  keepAspect: boolean;
  /** Alt: resize about the box centre. */
  fromCentre: boolean;
  container: { w: number; h: number };
}

/** A handle drag on a callout box, in container px; the box never leaves the stage. */
export function resizeCalloutBox(
  start: PxRect,
  handle: CalloutHandle,
  at: Point,
  { keepAspect, fromCentre, container }: BoxResizeOptions
): PxRect {
  const horiz = handle.includes('e') || handle.includes('w');
  const vert = handle.includes('n') || handle.includes('s');
  const cx = start.x + start.w / 2;
  const cy = start.y + start.h / 2;
  let w = start.w;
  let h = start.h;
  if (horiz) {
    const edge = at.x;
    w = fromCentre
      ? 2 * Math.abs(edge - cx)
      : handle.includes('e')
        ? edge - start.x
        : start.x + start.w - edge;
  }
  if (vert) {
    h = fromCentre
      ? 2 * Math.abs(at.y - cy)
      : handle.includes('s')
        ? at.y - start.y
        : start.y + start.h - at.y;
  }
  w = Math.max(w, CALLOUT_MIN_PX.w);
  h = Math.max(h, CALLOUT_MIN_PX.h);
  if (keepAspect && start.w > 0 && start.h > 0) {
    const aspect = start.w / start.h;
    if (horiz && vert) {
      const k = Math.max(w / start.w, h / start.h);
      w = start.w * k;
      h = start.h * k;
    } else if (horiz) {
      h = w / aspect;
    } else {
      w = h * aspect;
    }
  }
  w = Math.min(w, container.w);
  h = Math.min(h, container.h);
  // The edge opposite the handle stays put, or the centre with Alt; an untouched axis stays centred.
  const x =
    fromCentre || !horiz
      ? cx - w / 2
      : handle.includes('e')
        ? start.x
        : start.x + start.w - w;
  const y =
    fromCentre || !vert
      ? cy - h / 2
      : handle.includes('s')
        ? start.y
        : start.y + start.h - h;
  return {
    x: clamp(x, 0, container.w - w),
    y: clamp(y, 0, container.h - h),
    w,
    h,
  };
}

/** A container-px rect as an image-% callout box. */
export function containerRectToBox(
  g: StageGeometry,
  r: PxRect
): GuidedLearningCalloutBox {
  const a = g.containerPxToImagePct(r.x, r.y);
  const b = g.containerPxToImagePct(r.x + r.w, r.y + r.h);
  return {
    xPct: a.xPct,
    yPct: a.yPct,
    wPct: b.xPct - a.xPct,
    hPct: b.yPct - a.yPct,
  };
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
