import { SNAP_LAYOUT_CONSTANTS } from './layoutMath';
import {
  getWorldBounds,
  viewportToWrapper,
  type Bounds,
  type Point,
} from './zoomPanMath';
import type { PixelRect } from './proportionalLayout';

export interface BoardCamera {
  zoom: number;
  pan: Point;
}

// Board-space rect the teacher can currently see, minus edge padding and the dock.
export const getVisibleBoardBounds = (
  vw: number,
  vh: number,
  camera: BoardCamera
): Bounds => {
  const { PADDING, DOCK_HEIGHT } = SNAP_LAYOUT_CONSTANTS;
  const tl = viewportToWrapper(
    { x: PADDING, y: PADDING },
    camera.zoom,
    camera.pan,
    vw,
    vh
  );
  const br = viewportToWrapper(
    { x: vw - PADDING, y: Math.max(PADDING + 1, vh - DOCK_HEIGHT) },
    camera.zoom,
    camera.pan,
    vw,
    vh
  );
  const world = getWorldBounds(vw, vh);
  return {
    minX: Math.max(world.minX, tl.x),
    minY: Math.max(world.minY, tl.y),
    maxX: Math.min(world.maxX, br.x),
    maxY: Math.min(world.maxY, br.y),
  };
};

const GAP = SNAP_LAYOUT_CONSTANTS.GAP;
const CASCADE_STEP = 30;

const overlaps = (a: PixelRect, b: PixelRect): boolean =>
  a.x < b.x + b.w + GAP &&
  b.x < a.x + a.w + GAP &&
  a.y < b.y + b.h + GAP &&
  b.y < a.y + a.h + GAP;

// Centered in view if free, else the free spot nearest center, else a cascade off center.
export const findWidgetPlacement = (
  size: { w: number; h: number },
  occupied: PixelRect[],
  visible: Bounds
): Point => {
  const { w, h } = size;
  const centerX = (visible.minX + visible.maxX) / 2;
  const centerY = (visible.minY + visible.maxY) / 2;
  // A widget bigger than the view pins to the view's top/left edge.
  const clampX = (x: number) =>
    Math.max(visible.minX, Math.min(visible.maxX - w, x));
  const clampY = (y: number) =>
    Math.max(visible.minY, Math.min(visible.maxY - h, y));
  const center = { x: clampX(centerX - w / 2), y: clampY(centerY - h / 2) };
  const isFree = (p: Point) =>
    !occupied.some((o) => overlaps({ x: p.x, y: p.y, w, h }, o));

  if (isFree(center)) return roundPoint(center);

  // Candidate edges: the view's edges, the center line, and flush against each widget.
  const xs = new Set<number>([visible.minX, visible.maxX - w, center.x]);
  const ys = new Set<number>([visible.minY, visible.maxY - h, center.y]);
  for (const o of occupied) {
    xs.add(o.x + o.w + GAP);
    xs.add(o.x - w - GAP);
    xs.add(o.x);
    ys.add(o.y + o.h + GAP);
    ys.add(o.y - h - GAP);
    ys.add(o.y);
  }

  let best: Point | null = null;
  let bestDist = Infinity;
  for (const x of xs) {
    if (x < visible.minX || x + w > visible.maxX) continue;
    for (const y of ys) {
      if (y < visible.minY || y + h > visible.maxY) continue;
      const p = { x, y };
      if (!isFree(p)) continue;
      const dist = Math.hypot(x + w / 2 - centerX, y + h / 2 - centerY);
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
  }
  if (best) return roundPoint(best);

  // No room left: step diagonally off the center past any widget already sitting there.
  let p = center;
  for (let i = 1; i <= occupied.length; i++) {
    const taken = occupied.some(
      (o) =>
        Math.abs(o.x - p.x) < CASCADE_STEP / 2 &&
        Math.abs(o.y - p.y) < CASCADE_STEP / 2
    );
    if (!taken) break;
    p = {
      x: clampX(center.x + i * CASCADE_STEP),
      y: clampY(center.y + i * CASCADE_STEP),
    };
  }
  return roundPoint(p);
};

const roundPoint = (p: Point): Point => ({
  x: Math.round(p.x),
  y: Math.round(p.y),
});
