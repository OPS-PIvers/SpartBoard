import {
  BOARD_LAYOUT,
  chromeBands,
  contentArea,
  intersection,
  isOffCanvas,
  normalizeScreen,
  widgetRect,
  type ChromeBandId,
  type LayoutWidget,
  type Rect,
  type ScreenShape,
} from './geometry';

export interface BoardGap extends Rect {
  /** Share of the board area this empty space covers, 0 to 1. */
  share: number;
}

export interface BoardOverlap {
  a: string;
  b: string;
  rect: Rect;
}

export type DrawerSide = 'left' | 'right' | 'bottom';

export type ChromeCollision =
  | { widgetId: string; kind: ChromeBandId; rect: Rect }
  | { widgetId: string; kind: 'off-screen'; rect: Rect }
  | { widgetId: string; kind: 'drawer'; side: DrawerSide; rect: Rect };

export interface BoardAnalysis {
  gaps: BoardGap[];
  overlaps: BoardOverlap[];
  chromeCollisions: ChromeCollision[];
}

// Touching edges and rounding never count as an overlap or a collision.
const MIN_OVERLAP_PX = 2;
const MIN_GAP_PX = 120;
const MIN_GAP_SHARE = 0.03;
const MAX_GAPS = 6;
const MAX_GAP_ROUNDS = 40;

const DRAWER_WIDGET_TYPE = 'need-do-put-then';

const significant = (r: Rect | null): r is Rect =>
  r !== null && r.w >= MIN_OVERLAP_PX && r.h >= MIN_OVERLAP_PX;

/** Where Need/Do/Put/Then drawers reach when opened at their default size. */
export const drawerRects = (rect: Rect): { side: DrawerSide; rect: Rect }[] => {
  const {
    DRAWER_SIDE_MAX,
    DRAWER_SIDE_SHARE,
    DRAWER_BOTTOM_SHARE,
    DRAWER_OVERLAP_MAX,
    DRAWER_OVERLAP_SHARE,
  } = BOARD_LAYOUT;
  const sideReach =
    Math.min(DRAWER_SIDE_MAX, DRAWER_SIDE_SHARE * rect.w) -
    Math.min(DRAWER_OVERLAP_MAX, DRAWER_OVERLAP_SHARE * rect.w);
  const bottomReach =
    Math.min(DRAWER_SIDE_MAX, DRAWER_BOTTOM_SHARE * rect.h) -
    Math.min(DRAWER_OVERLAP_MAX, DRAWER_OVERLAP_SHARE * rect.h);
  return [
    {
      side: 'left',
      rect: { x: rect.x - sideReach, y: rect.y, w: sideReach, h: rect.h },
    },
    {
      side: 'right',
      rect: { x: rect.x + rect.w, y: rect.y, w: sideReach, h: rect.h },
    },
    {
      side: 'bottom',
      rect: { x: rect.x, y: rect.y + rect.h, w: rect.w, h: bottomReach },
    },
  ];
};

const offScreen = (rect: Rect, screen: ScreenShape): boolean =>
  rect.x < -1 ||
  rect.y < -1 ||
  rect.x + rect.w > screen.w + 1 ||
  rect.y + rect.h > screen.h + 1;

// Largest empty rectangles in the board area, found on the grid every widget edge draws.
const findGaps = (rects: Rect[], area: Rect): BoardGap[] => {
  const clampX = (v: number) => Math.min(area.x + area.w, Math.max(area.x, v));
  const clampY = (v: number) => Math.min(area.y + area.h, Math.max(area.y, v));
  const xs = [
    ...new Set([
      area.x,
      area.x + area.w,
      ...rects.flatMap((r) => [clampX(r.x), clampX(r.x + r.w)]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      area.y,
      area.y + area.h,
      ...rects.flatMap((r) => [clampY(r.y), clampY(r.y + r.h)]),
    ]),
  ].sort((a, b) => a - b);
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const filled: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const cy = (ys[r] + ys[r + 1]) / 2;
    filled.push(
      Array.from({ length: cols }, (_, c) => {
        const cx = (xs[c] + xs[c + 1]) / 2;
        return rects.some(
          (rect) =>
            cx > rect.x &&
            cx < rect.x + rect.w &&
            cy > rect.y &&
            cy < rect.y + rect.h
        );
      })
    );
  }
  const areaSize = area.w * area.h;
  const gaps: BoardGap[] = [];
  for (
    let round = 0;
    gaps.length < MAX_GAPS && round < MAX_GAP_ROUNDS;
    round++
  ) {
    let best: {
      r0: number;
      r1: number;
      c0: number;
      c1: number;
      size: number;
    } | null = null;
    const runs = new Array<number>(cols).fill(0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) runs[c] = filled[r][c] ? 0 : runs[c] + 1;
      for (let c0 = 0; c0 < cols; c0++) {
        let minRun = Infinity;
        for (let c1 = c0; c1 < cols; c1++) {
          minRun = Math.min(minRun, runs[c1]);
          if (minRun === 0) break;
          const w = xs[c1 + 1] - xs[c0];
          const h = ys[r + 1] - ys[r + 1 - minRun];
          const size = w * h;
          if (!best || size > best.size)
            best = { r0: r + 1 - minRun, r1: r, c0, c1, size };
        }
      }
    }
    if (!best) break;
    const gap = {
      x: xs[best.c0],
      y: ys[best.r0],
      w: xs[best.c1 + 1] - xs[best.c0],
      h: ys[best.r1 + 1] - ys[best.r0],
    };
    if (best.size / areaSize < MIN_GAP_SHARE) break;
    // A thin strip is not a gap, but smaller real gaps may still sit beside it.
    if (gap.w >= MIN_GAP_PX && gap.h >= MIN_GAP_PX)
      gaps.push({ ...gap, share: best.size / areaSize });
    for (let r = best.r0; r <= best.r1; r++)
      for (let c = best.c0; c <= best.c1; c++) filled[r][c] = true;
  }
  return gaps;
};

/** Empty space, overlapping widgets, and widgets under the app's buttons, dock or off the screen. */
export const analyze = (
  widgets: readonly LayoutWidget[],
  screen?: ScreenShape
): BoardAnalysis => {
  const shape = normalizeScreen(screen);
  const placed = widgets.flatMap((widget) => {
    if (isOffCanvas(widget)) return [];
    const rect = widgetRect(widget, shape);
    return rect ? [{ widget, rect }] : [];
  });

  const overlaps: BoardOverlap[] = [];
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const rect = intersection(placed[i].rect, placed[j].rect);
      if (significant(rect))
        overlaps.push({ a: placed[i].widget.id, b: placed[j].widget.id, rect });
    }

  const bands = chromeBands(shape);
  const chromeCollisions: ChromeCollision[] = [];
  for (const { widget, rect } of placed) {
    if (offScreen(rect, shape))
      chromeCollisions.push({ widgetId: widget.id, kind: 'off-screen', rect });
    const underDock = bands.some(
      (band) => band.id === 'dock' && significant(intersection(rect, band))
    );
    for (const band of bands) {
      // The board buttons sit inside the dock band; report them only for widgets that miss the dock.
      if (underDock && band.id.startsWith('board-buttons')) continue;
      const hit = intersection(rect, band);
      if (significant(hit))
        chromeCollisions.push({
          widgetId: widget.id,
          kind: band.id,
          rect: hit,
        });
    }
    if (widget.type === DRAWER_WIDGET_TYPE)
      for (const drawer of drawerRects(rect)) {
        const blocked =
          offScreen(drawer.rect, shape) ||
          bands.some((band) => significant(intersection(drawer.rect, band)));
        if (blocked)
          chromeCollisions.push({
            widgetId: widget.id,
            kind: 'drawer',
            side: drawer.side,
            rect: drawer.rect,
          });
      }
  }

  return {
    gaps: findGaps(
      placed.map((p) => p.rect),
      contentArea(shape)
    ),
    overlaps,
    chromeCollisions,
  };
};
