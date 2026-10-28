import { SNAP_ZONE_LAYOUTS, type SnapZoneLayout } from '@/config/snapZones';
import {
  contentArea,
  intersection,
  isFixed,
  isOffCanvas,
  normalizeScreen,
  toPlacedRect,
  widgetRect,
  zoneRect,
  type LayoutWidget,
  type PlacedRect,
  type Rect,
  type ScreenShape,
} from './geometry';

export interface TidyResult<T extends LayoutWidget> {
  /** The snap layout every widget now sits on; null when the board needed zones from several layouts. */
  layoutId: string | null;
  widgets: (T & PlacedRect)[];
  /** Zone each widget landed on, by widget id; widgets left in place are absent. */
  zones: Record<string, string>;
  /** Widgets that found no free zone and still overlap others; the teacher should remove or rearrange some. */
  unplaced: string[];
}

const FULL_LAYOUT: SnapZoneLayout = {
  id: 'full',
  nameKey: 'full',
  zones: [{ id: 'full', x: 0, y: 0, w: 1, h: 1 }],
};

const TIDY_LAYOUTS: readonly SnapZoneLayout[] = [
  FULL_LAYOUT,
  ...SNAP_ZONE_LAYOUTS,
];

// An empty zone costs a quarter of its share of the board, so boards fill out without forcing widgets far.
const EMPTY_ZONE_WEIGHT = 0.25;
const SAME_SPOT = 1e-6;

interface Candidate {
  layoutId: string;
  zoneId: string;
  rect: Rect;
}

const moveCost = (from: Rect, to: Rect, area: Rect): number =>
  (Math.abs(from.x + from.w / 2 - (to.x + to.w / 2)) +
    Math.abs(from.w - to.w)) /
    area.w +
  (Math.abs(from.y + from.h / 2 - (to.y + to.h / 2)) +
    Math.abs(from.h - to.h)) /
    area.h;

// Cheapest way to give every widget its own zone of one layout (exact, over zone subsets).
const assignToLayout = (
  rects: Rect[],
  zones: Rect[],
  area: Rect
): { move: number; cost: number; picks: number[] } => {
  const n = rects.length;
  const z = zones.length;
  const size = 1 << z;
  const cost = new Array<number>(size).fill(Infinity);
  const from = new Array<number>(size).fill(-1);
  cost[0] = 0;
  const bits = (mask: number) => {
    let count = 0;
    for (let m = mask; m; m &= m - 1) count++;
    return count;
  };
  for (let mask = 0; mask < size; mask++) {
    if (cost[mask] === Infinity) continue;
    const i = bits(mask);
    if (i >= n) continue;
    for (let k = 0; k < z; k++) {
      if (mask & (1 << k)) continue;
      const next = mask | (1 << k);
      const total = cost[mask] + moveCost(rects[i], zones[k], area);
      if (total < cost[next]) {
        cost[next] = total;
        from[next] = k;
      }
    }
  }
  let bestMask = -1;
  for (let mask = 0; mask < size; mask++) {
    if (bits(mask) !== n || cost[mask] === Infinity) continue;
    if (bestMask < 0 || cost[mask] < cost[bestMask] - SAME_SPOT)
      bestMask = mask;
  }
  const areaSize = area.w * area.h;
  let empty = 0;
  for (let k = 0; k < z; k++)
    if (!(bestMask & (1 << k))) empty += (zones[k].w * zones[k].h) / areaSize;
  const picks = new Array<number>(n).fill(-1);
  for (let mask = bestMask, i = n - 1; mask > 0; i--) {
    const k = from[mask];
    picks[i] = k;
    mask &= ~(1 << k);
  }
  return {
    move: cost[bestMask],
    cost: cost[bestMask] + EMPTY_ZONE_WEIGHT * empty,
    picks,
  };
};

const clampInto = (rect: Rect, area: Rect): Rect => {
  const w = Math.min(rect.w, area.w);
  const h = Math.min(rect.h, area.h);
  return {
    x: Math.min(area.x + area.w - w, Math.max(area.x, rect.x)),
    y: Math.min(area.y + area.h - h, Math.max(area.y, rect.y)),
    w,
    h,
  };
};

const overlapsAny = (rect: Rect, taken: Rect[]) =>
  taken.some((other) => {
    const hit = intersection(rect, other);
    return hit !== null && hit.w >= 2 && hit.h >= 2;
  });

const tidyMovable = <T extends LayoutWidget>(
  widgets: readonly T[],
  shape: ScreenShape,
  obstacles: Rect[]
): TidyResult<T> => {
  const area = contentArea(shape);
  const fallback: Rect = {
    x: area.x + area.w / 4,
    y: area.y + area.h / 4,
    w: area.w / 2,
    h: area.h / 2,
  };
  const rects = widgets.map((w) => widgetRect(w, shape) ?? fallback);
  if (widgets.length === 0)
    return { layoutId: null, widgets: [], zones: {}, unplaced: [] };

  let best: { layout: SnapZoneLayout; picks: number[]; cost: number } | null =
    null;
  for (const layout of TIDY_LAYOUTS) {
    const free = layout.zones.filter(
      (zone) => !overlapsAny(zoneRect(zone, shape), obstacles)
    );
    if (free.length < widgets.length) continue;
    const zoneRects = free.map((zone) => zoneRect(zone, shape));
    const { move, cost, picks } = assignToLayout(rects, zoneRects, area);
    const usable = { ...layout, zones: free };
    // A board already sitting exactly on one layout keeps it, so tidying twice changes nothing.
    if (move < SAME_SPOT) {
      best = { layout: usable, picks, cost };
      break;
    }
    if (!best || cost < best.cost - SAME_SPOT)
      best = { layout: usable, picks, cost };
  }

  if (best) {
    const { layout, picks } = best;
    const zones: Record<string, string> = {};
    const placed = widgets.map((widget, i) => {
      const zone = layout.zones[picks[i]];
      zones[widget.id] = zone.id;
      return { ...widget, ...toPlacedRect(zoneRect(zone, shape), shape) };
    });
    return { layoutId: layout.id, widgets: placed, zones, unplaced: [] };
  }

  // More widgets than any layout has zones: give each the nearest free zone from any layout.
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const layout of SNAP_ZONE_LAYOUTS)
    for (const zone of layout.zones) {
      const rect = zoneRect(zone, shape);
      if (overlapsAny(rect, obstacles)) continue;
      const key = [rect.x, rect.y, rect.w, rect.h]
        .map((v) => v.toFixed(3))
        .join();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ layoutId: layout.id, zoneId: zone.id, rect });
    }

  const order = widgets.map((_, i) => i);
  const onZone = (i: number) =>
    candidates.some((c) => moveCost(rects[i], c.rect, area) < SAME_SPOT);
  order.sort((a, b) => {
    const exact = Number(onZone(b)) - Number(onZone(a));
    if (exact !== 0) return exact;
    return rects[b].w * rects[b].h - rects[a].w * rects[a].h;
  });

  const taken: Rect[] = [];
  const targets = new Array<Rect>(widgets.length);
  const zones: Record<string, string> = {};
  const unplaced: string[] = [];
  for (const i of order) {
    let pick: Candidate | null = null;
    let pickCost = Infinity;
    for (const candidate of candidates) {
      if (overlapsAny(candidate.rect, taken)) continue;
      const cost = moveCost(rects[i], candidate.rect, area);
      if (cost < pickCost - SAME_SPOT) {
        pick = candidate;
        pickCost = cost;
      }
    }
    if (pick) {
      taken.push(pick.rect);
      targets[i] = pick.rect;
      zones[widgets[i].id] = `${pick.layoutId}:${pick.zoneId}`;
    } else {
      targets[i] = clampInto(rects[i], area);
      unplaced.push(widgets[i].id);
    }
  }
  return {
    layoutId: null,
    widgets: widgets.map((widget, i) => ({
      ...widget,
      ...toPlacedRect(targets[i], shape),
    })),
    zones,
    unplaced,
  };
};

/** Moves widgets onto the best-fitting snap layout, or the nearest free zones; only geometry changes. Locked, pinned, minimized and maximized widgets stay put. */
export const tidy = <T extends LayoutWidget>(
  widgets: readonly T[],
  screen?: ScreenShape
): TidyResult<T> => {
  const shape = normalizeScreen(screen);
  const stays = (w: T) => isFixed(w) || isOffCanvas(w);
  const obstacles = widgets.flatMap((w) => {
    if (!isFixed(w) || isOffCanvas(w)) return [];
    const rect = widgetRect(w, shape);
    return rect ? [rect] : [];
  });
  const movable = widgets.filter((w) => !stays(w));
  const result = tidyMovable(movable, shape, obstacles);
  if (movable.length === widgets.length) return result;
  let next = 0;
  return {
    ...result,
    widgets: widgets.map((widget) => {
      if (!stays(widget)) return result.widgets[next++];
      const rect = widgetRect(widget, shape) ?? contentArea(shape);
      return { ...toPlacedRect(rect, shape), ...widget };
    }),
  };
};
