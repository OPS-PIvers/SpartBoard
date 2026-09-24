import type { PxRect, Side } from '../types/stage';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface PlaceCalloutInput {
  box: Size;
  target: PxRect;
  container: Size;
  prefer?: Side;
  /** Container px for the box centre; absent = auto placement. */
  pinned?: Point;
  padding?: number;
  offset?: number;
  /** Narrowest width auto placement may shrink to before accepting overlap. */
  minWidth?: number;
}

export interface CalloutPlacement {
  left: number;
  top: number;
  /** Box width after any shrink; equals box.w unless auto placement narrowed it. */
  width: number;
  side: Side;
  arrow: CalloutArrowGeometry;
}

export interface CalloutArrowGeometry {
  from: Point;
  to: Point;
  /** Unit outward normal of the box edge the line leaves from. */
  normal: Point;
}

export const CALLOUT_PADDING = 12;
export const CALLOUT_OFFSET = 16;
export const CALLOUT_MIN_WIDTH = 200;

const AUTO_ORDER: Side[] = ['bottom', 'top', 'right', 'left'];

const clamp = (n: number, lo: number, hi: number): number =>
  hi < lo ? lo : Math.min(Math.max(n, lo), hi);

export function rectOverlapArea(a: PxRect, b: PxRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function nearestPointOnRect(p: Point, r: PxRect): Point {
  return {
    x: clamp(p.x, r.x, r.x + r.w),
    y: clamp(p.y, r.y, r.y + r.h),
  };
}

/** Outward normal of the box edge `p` lies on; corners pick the axis facing `toward`. */
function edgeNormal(p: Point, box: PxRect, toward: Point): Point {
  const onLeft = p.x <= box.x;
  const onRight = p.x >= box.x + box.w;
  const onTop = p.y <= box.y;
  const onBottom = p.y >= box.y + box.h;
  const horizontal = onLeft || onRight;
  const vertical = onTop || onBottom;
  const dx = toward.x - p.x;
  const dy = toward.y - p.y;
  const useX = horizontal && (!vertical || Math.abs(dx) >= Math.abs(dy));
  if (useX) return { x: onLeft ? -1 : 1, y: 0 };
  if (vertical) return { x: 0, y: onTop ? -1 : 1 };
  // Target overlaps the box: head straight for it.
  const len = Math.hypot(dx, dy);
  return len > 0 ? { x: dx / len, y: dy / len } : { x: 0, y: 1 };
}

/** Arrow from the box edge nearest the target to the target edge nearest that point. */
export function arrowBetween(
  box: PxRect,
  target: PxRect
): CalloutArrowGeometry {
  const targetCentre = {
    x: target.x + target.w / 2,
    y: target.y + target.h / 2,
  };
  const from = nearestPointOnRect(targetCentre, box);
  const to = nearestPointOnRect(from, target);
  return { from, to, normal: edgeNormal(from, box, to) };
}

export interface LeaderCurve {
  c1: Point;
  c2: Point;
  /** Unit tangent of the curve where it meets the target. */
  endTangent: Point;
}

/** Control points so a line leaves the box square to its edge and bends into the target. */
export function leaderCurve(
  from: Point,
  normal: Point,
  to: Point
): LeaderCurve {
  const chord = Math.hypot(to.x - from.x, to.y - from.y);
  // ~40% of the chord, eased toward 0 under 48px so short lines stay nearly straight.
  const d = 0.4 * chord * Math.min(1, chord / 48);
  const c1 = { x: from.x + normal.x * d, y: from.y + normal.y * d };
  const bx = c1.x - to.x;
  const by = c1.y - to.y;
  const blen = Math.hypot(bx, by);
  const c2 =
    blen > 0
      ? { x: to.x + (bx / blen) * d, y: to.y + (by / blen) * d }
      : { ...to };
  const tx = to.x - c2.x;
  const ty = to.y - c2.y;
  const tlen = Math.hypot(tx, ty);
  const endTangent =
    tlen > 0
      ? { x: tx / tlen, y: ty / tlen }
      : chord > 0
        ? { x: (to.x - from.x) / chord, y: (to.y - from.y) / chord }
        : { x: 0, y: 1 };
  return { c1, c2, endTangent };
}

interface Candidate {
  side: Side;
  rect: PxRect;
  fits: boolean;
}

function candidateFor(
  side: Side,
  box: Size,
  t: PxRect,
  c: Size,
  padding: number,
  offset: number
): Candidate {
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  const minX = padding;
  const maxX = c.w - padding - box.w;
  const minY = padding;
  const maxY = c.h - padding - box.h;
  let left: number;
  let top: number;
  let fits: boolean;
  if (side === 'bottom' || side === 'top') {
    left = clamp(cx - box.w / 2, minX, maxX);
    top = side === 'bottom' ? t.y + t.h + offset : t.y - offset - box.h;
    fits = maxX >= minX && top >= minY && top <= maxY;
  } else {
    top = clamp(cy - box.h / 2, minY, maxY);
    left = side === 'right' ? t.x + t.w + offset : t.x - offset - box.w;
    fits = maxY >= minY && left >= minX && left <= maxX;
  }
  if (!fits) {
    // Out of room on this side: fall back to clamping inside the container.
    left = clamp(left, minX, maxX);
    top = clamp(top, minY, maxY);
  }
  return { side, rect: { x: left, y: top, w: box.w, h: box.h }, fits };
}

function sideOf(box: PxRect, t: PxRect): Side {
  const dx = box.x + box.w / 2 - (t.x + t.w / 2);
  const dy = box.y + box.h / 2 - (t.y + t.h / 2);
  const nx = dx / Math.max(box.w + t.w, 1);
  const ny = dy / Math.max(box.h + t.h, 1);
  if (Math.abs(ny) >= Math.abs(nx)) return ny >= 0 ? 'bottom' : 'top';
  return nx >= 0 ? 'right' : 'left';
}

/** Places a callout box so it never covers its target when any side has room. */
export function placeCallout(input: PlaceCalloutInput): CalloutPlacement {
  const {
    box,
    target,
    container,
    prefer,
    pinned,
    padding = CALLOUT_PADDING,
    offset = CALLOUT_OFFSET,
    minWidth = CALLOUT_MIN_WIDTH,
  } = input;

  if (pinned) {
    const rect: PxRect = {
      x: clamp(pinned.x - box.w / 2, padding, container.w - padding - box.w),
      y: clamp(pinned.y - box.h / 2, padding, container.h - padding - box.h),
      w: box.w,
      h: box.h,
    };
    return {
      left: rect.x,
      top: rect.y,
      width: box.w,
      side: sideOf(rect, target),
      arrow: arrowBetween(rect, target),
    };
  }

  const order = prefer
    ? [prefer, ...AUTO_ORDER.filter((s) => s !== prefer)]
    : AUTO_ORDER;

  const candidates: Candidate[] = [];
  for (const side of order) {
    candidates.push(
      candidateFor(side, box, target, container, padding, offset)
    );
  }
  // Shrink toward minWidth (text reflows taller) before accepting any overlap.
  if (box.w > minWidth) {
    for (const side of order) {
      let room: number;
      if (side === 'right')
        room = container.w - padding - (target.x + target.w + offset);
      else if (side === 'left') room = target.x - offset - padding;
      else room = container.w - 2 * padding;
      const w = Math.max(minWidth, Math.min(box.w, room));
      if (w >= box.w) continue;
      const shrunk = { w, h: (box.h * box.w) / w };
      candidates.push(
        candidateFor(side, shrunk, target, container, padding, offset)
      );
    }
  }

  const fitting = candidates.find(
    (c) => c.fits && rectOverlapArea(c.rect, target) === 0
  );
  let best: Candidate;
  if (fitting) {
    best = fitting;
  } else {
    best = candidates[0];
    let bestOverlap = rectOverlapArea(best.rect, target);
    for (const c of candidates) {
      const overlap = rectOverlapArea(c.rect, target);
      if (overlap < bestOverlap) {
        best = c;
        bestOverlap = overlap;
      }
    }
  }
  return {
    left: best.rect.x,
    top: best.rect.y,
    width: best.rect.w,
    side: best.side,
    arrow: arrowBetween(best.rect, target),
  };
}

/** Banners sit at the bottom when the target's centre is in the top 40%. */
export function placeBanner(target: PxRect, container: Size): 'top' | 'bottom' {
  const cy = target.y + target.h / 2;
  return cy < container.h * 0.4 ? 'bottom' : 'top';
}

/** Centred unless that covers the target, else the centre of the freest quadrant. */
export function placePopover(
  box: Size,
  target: PxRect,
  container: Size,
  padding = CALLOUT_PADDING
): { left: number; top: number } {
  const place = (cx: number, cy: number): PxRect => ({
    x: clamp(cx - box.w / 2, padding, container.w - padding - box.w),
    y: clamp(cy - box.h / 2, padding, container.h - padding - box.h),
    w: box.w,
    h: box.h,
  });
  const centred = place(container.w / 2, container.h / 2);
  if (rectOverlapArea(centred, target) === 0) {
    return { left: centred.x, top: centred.y };
  }
  const tcx = target.x + target.w / 2;
  const tcy = target.y + target.h / 2;
  let best = centred;
  let bestOverlap = rectOverlapArea(centred, target);
  let bestDist = -1;
  for (const qx of [0.25, 0.75]) {
    for (const qy of [0.25, 0.75]) {
      const r = place(container.w * qx, container.h * qy);
      const overlap = rectOverlapArea(r, target);
      const dist = Math.hypot(r.x + r.w / 2 - tcx, r.y + r.h / 2 - tcy);
      if (
        overlap < bestOverlap ||
        (overlap === bestOverlap && dist > bestDist)
      ) {
        best = r;
        bestOverlap = overlap;
        bestDist = dist;
      }
    }
  }
  return { left: best.x, top: best.y };
}
