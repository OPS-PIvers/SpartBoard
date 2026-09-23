import type { GuidedLearningRegion, GuidedLearningStep } from '@/types';
import type { PctPoint } from '../../types/stage';
import {
  MIN_REGION_PCT,
  clampRegion,
  polygonBBox,
} from '../../utils/regionGeometry';

/** An image-% box by its edges. */
export interface PctBox {
  l: number;
  t: number;
  r: number;
  b: number;
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const RESIZE_HANDLES: readonly ResizeHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

export type StudioShape = 'point' | GuidedLearningRegion['shape'];

/** Size of a region created from a point, in image-%. */
export const DEFAULT_REGION_PCT = 12;
const MIN_POLYGON_POINTS = 3;
const MAX_POLYGON_POINTS = 24;

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(Math.max(n, lo), hi);

export function stepBox(step: GuidedLearningStep): PctBox {
  const w = step.region?.wPct ?? 0;
  const h = step.region?.hPct ?? 0;
  return {
    l: step.xPct - w / 2,
    t: step.yPct - h / 2,
    r: step.xPct + w / 2,
    b: step.yPct + h / 2,
  };
}

/** Writes a clamped centre and region back onto a step. */
function withRegion(
  step: GuidedLearningStep,
  centre: PctPoint,
  region: GuidedLearningRegion
): GuidedLearningStep {
  const next = clampRegion(centre, region);
  return {
    ...step,
    xPct: next.centre.xPct,
    yPct: next.centre.yPct,
    region: next.region,
  };
}

/** A rect or ellipse step filling `box`. */
export function stepWithBox(
  step: GuidedLearningStep,
  box: PctBox,
  shape: 'rect' | 'ellipse'
): GuidedLearningStep {
  const l = clamp(Math.min(box.l, box.r), 0, 100);
  const r = clamp(Math.max(box.l, box.r), 0, 100);
  const t = clamp(Math.min(box.t, box.b), 0, 100);
  const b = clamp(Math.max(box.t, box.b), 0, 100);
  const region: GuidedLearningRegion = {
    ...(step.region?.shape === shape ? step.region : {}),
    shape,
    wPct: r - l,
    hPct: b - t,
  };
  delete region.points;
  if (shape !== 'rect') delete region.cornerPct;
  return withRegion(step, { xPct: (l + r) / 2, yPct: (t + b) / 2 }, region);
}

/** A polygon step through `points`. */
export function stepWithPolygon(
  step: GuidedLearningStep,
  points: { x: number; y: number }[]
): GuidedLearningStep {
  const pts = points.map((p) => ({
    x: clamp(p.x, 0, 100),
    y: clamp(p.y, 0, 100),
  }));
  const box = polygonBBox(pts);
  return withRegion(
    step,
    { xPct: box.xPct, yPct: box.yPct },
    { shape: 'polygon', wPct: box.wPct, hPct: box.hPct, points: pts }
  );
}

/** Translates a step (point, region or every polygon vertex) and keeps it on the image. */
export function moveStep(
  step: GuidedLearningStep,
  dx: number,
  dy: number
): GuidedLearningStep {
  const region = step.region;
  if (!region) {
    return {
      ...step,
      xPct: clamp(step.xPct + dx, 0, 100),
      yPct: clamp(step.yPct + dy, 0, 100),
    };
  }
  if (region.shape === 'polygon' && region.points) {
    const box = stepBox(step);
    const cdx = clamp(dx, -box.l, 100 - box.r);
    const cdy = clamp(dy, -box.t, 100 - box.b);
    return stepWithPolygon(
      step,
      region.points.map((p) => ({ x: p.x + cdx, y: p.y + cdy }))
    );
  }
  return withRegion(
    step,
    { xPct: step.xPct + dx, yPct: step.yPct + dy },
    region
  );
}

/** Moves the edges a handle owns to `p`, keeping the minimum edge. */
export function resizeBox(
  box: PctBox,
  handle: ResizeHandle,
  p: PctPoint
): PctBox {
  const next = { ...box };
  if (handle.includes('w')) next.l = Math.min(p.xPct, box.r - MIN_REGION_PCT);
  if (handle.includes('e')) next.r = Math.max(p.xPct, box.l + MIN_REGION_PCT);
  if (handle.includes('n')) next.t = Math.min(p.yPct, box.b - MIN_REGION_PCT);
  if (handle.includes('s')) next.b = Math.max(p.yPct, box.t + MIN_REGION_PCT);
  return {
    l: clamp(next.l, 0, 100),
    t: clamp(next.t, 0, 100),
    r: clamp(next.r, 0, 100),
    b: clamp(next.b, 0, 100),
  };
}

/**
 * Box dragged from `a` to `b`. With `square`, the shorter side grows to match
 * the longer one on screen, using the screen px per image-% ratio.
 */
export function dragBox(
  a: PctPoint,
  b: PctPoint,
  square: boolean,
  pxPerPct: { x: number; y: number }
): PctBox {
  let dx = b.xPct - a.xPct;
  let dy = b.yPct - a.yPct;
  if (square) {
    const side = Math.max(Math.abs(dx) * pxPerPct.x, Math.abs(dy) * pxPerPct.y);
    dx = (Math.sign(dx) || 1) * (side / pxPerPct.x);
    dy = (Math.sign(dy) || 1) * (side / pxPerPct.y);
  }
  return {
    l: Math.min(a.xPct, a.xPct + dx),
    r: Math.max(a.xPct, a.xPct + dx),
    t: Math.min(a.yPct, a.yPct + dy),
    b: Math.max(a.yPct, a.yPct + dy),
  };
}

export function setVertex(
  step: GuidedLearningStep,
  index: number,
  p: PctPoint
): GuidedLearningStep {
  const points = step.region?.points;
  if (!points?.[index]) return step;
  return stepWithPolygon(
    step,
    points.map((v, i) => (i === index ? { x: p.xPct, y: p.yPct } : v))
  );
}

/** Inserts a vertex after `afterIndex`, up to 24. */
export function insertVertex(
  step: GuidedLearningStep,
  afterIndex: number,
  p: PctPoint
): GuidedLearningStep {
  const points = step.region?.points;
  if (!points || points.length >= MAX_POLYGON_POINTS) return step;
  const next = [...points];
  next.splice(afterIndex + 1, 0, { x: p.xPct, y: p.yPct });
  return stepWithPolygon(step, next);
}

/** Removes a vertex, keeping at least three. */
export function removeVertex(
  step: GuidedLearningStep,
  index: number
): GuidedLearningStep {
  const points = step.region?.points;
  if (!points || points.length <= MIN_POLYGON_POINTS || !points[index]) {
    return step;
  }
  return stepWithPolygon(
    step,
    points.filter((_, i) => i !== index)
  );
}

/** Switches a step's shape; rect seeds a 4-vertex polygon and ellipse a 12-vertex one. */
export function convertShape(
  step: GuidedLearningStep,
  shape: StudioShape
): GuidedLearningStep {
  const current: StudioShape = step.region?.shape ?? 'point';
  if (current === shape) return step;
  if (shape === 'point') {
    const next = { ...step };
    delete next.region;
    return next;
  }
  const box = step.region
    ? stepBox(step)
    : {
        l: step.xPct - DEFAULT_REGION_PCT / 2,
        r: step.xPct + DEFAULT_REGION_PCT / 2,
        t: step.yPct - DEFAULT_REGION_PCT / 2,
        b: step.yPct + DEFAULT_REGION_PCT / 2,
      };
  if (shape !== 'polygon') return stepWithBox(step, box, shape);
  const cx = (box.l + box.r) / 2;
  const cy = (box.t + box.b) / 2;
  const rx = (box.r - box.l) / 2;
  const ry = (box.b - box.t) / 2;
  const points =
    current === 'ellipse'
      ? Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
        })
      : [
          { x: box.l, y: box.t },
          { x: box.r, y: box.t },
          { x: box.r, y: box.b },
          { x: box.l, y: box.b },
        ];
  return stepWithPolygon(step, points);
}

/** Rect corner radius, 0–50% of the shorter side. */
export function setCorner(
  step: GuidedLearningStep,
  cornerPct: number
): GuidedLearningStep {
  if (step.region?.shape !== 'rect') return step;
  return {
    ...step,
    region: { ...step.region, cornerPct: clamp(cornerPct, 0, 50) },
  };
}

export function clearCalloutPin(step: GuidedLearningStep): GuidedLearningStep {
  const next = { ...step };
  delete next.calloutPin;
  return next;
}

export function setCalloutPin(
  step: GuidedLearningStep,
  p: PctPoint
): GuidedLearningStep {
  return {
    ...step,
    calloutPin: { xPct: clamp(p.xPct, 0, 100), yPct: clamp(p.yPct, 0, 100) },
  };
}

/** Closest polygon edge to `p` within `maxPx` screen px, as the index of its first vertex. */
export function nearestEdge(
  points: { x: number; y: number }[],
  p: PctPoint,
  pxPerPct: { x: number; y: number },
  maxPx: number
): number | null {
  let best: { i: number; d: number } | null = null;
  const px = p.xPct * pxPerPct.x;
  const py = p.yPct * pxPerPct.y;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const ax = a.x * pxPerPct.x;
    const ay = a.y * pxPerPct.y;
    const bx = b.x * pxPerPct.x;
    const by = b.y * pxPerPct.y;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const u =
      len2 === 0
        ? 0
        : clamp(((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2, 0, 1);
    const d = Math.hypot(px - (ax + u * (bx - ax)), py - (ay + u * (by - ay)));
    if (d <= maxPx && (!best || d < best.d)) best = { i, d };
  }
  return best ? best.i : null;
}
