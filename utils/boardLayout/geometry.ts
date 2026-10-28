import type { SnapZone } from '@/config/snapZones';

export interface ScreenShape {
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedRect extends Rect {
  xProp: number;
  yProp: number;
  wProp: number;
  hProp: number;
  aspectRatio: number;
}

export interface LayoutWidget {
  id: string;
  type?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  xProp?: number;
  yProp?: number;
  wProp?: number;
  hProp?: number;
  aspectRatio?: number;
  minimized?: boolean;
  maximized?: boolean;
  isLocked?: boolean;
  isPinned?: boolean;
}

/** Minimized and maximized widgets are not on the canvas layout. */
export const isOffCanvas = (widget: LayoutWidget): boolean =>
  widget.minimized === true || widget.maximized === true;

/** Widgets the teacher locked or pinned in place; layout never moves them. */
export const isFixed = (widget: LayoutWidget): boolean =>
  widget.isLocked === true || widget.isPinned === true;

export type ChromeBandId =
  'app-buttons' | 'dock' | 'board-buttons-left' | 'board-buttons-right';

export interface ChromeBand extends Rect {
  id: ChromeBandId;
}

export const DEFAULT_SCREEN: ScreenShape = { w: 1920, h: 1080 };

// Mirrors utils/layoutMath.ts SNAP_LAYOUT_CONSTANTS and the fixed app chrome measured in docs/plans/AI_BOARDS.md.
export const BOARD_LAYOUT = {
  PADDING: 16,
  GAP: 12,
  APP_BUTTONS_BOTTOM: 78,
  APP_BUTTONS_RIGHT: 400,
  DOCK_FROM_BOTTOM: 80,
  BOARD_BUTTONS_FROM_BOTTOM: 56,
  BOARD_BUTTONS_WIDTH: 160,
  DRAWER_SIDE_MAX: 240,
  DRAWER_SIDE_SHARE: 0.6,
  DRAWER_BOTTOM_SHARE: 0.65,
  DRAWER_OVERLAP_MAX: 28,
  DRAWER_OVERLAP_SHARE: 0.07,
  MIN_SCREEN_W: 320,
  MIN_SCREEN_H: 240,
} as const;

const EDGE_EPSILON = 1e-6;

export const normalizeScreen = (screen?: ScreenShape): ScreenShape => {
  const w = Number.isFinite(screen?.w) ? Number(screen?.w) : DEFAULT_SCREEN.w;
  const h = Number.isFinite(screen?.h) ? Number(screen?.h) : DEFAULT_SCREEN.h;
  return {
    w: Math.max(BOARD_LAYOUT.MIN_SCREEN_W, w),
    h: Math.max(BOARD_LAYOUT.MIN_SCREEN_H, h),
  };
};

/** Board area that stays clear of the app buttons above and the dock below. */
export const contentArea = (screen?: ScreenShape): Rect => {
  const { w, h } = normalizeScreen(screen);
  const { PADDING, GAP, APP_BUTTONS_BOTTOM, DOCK_FROM_BOTTOM } = BOARD_LAYOUT;
  const top = APP_BUTTONS_BOTTOM + GAP / 2;
  const bottom = h - DOCK_FROM_BOTTOM - GAP / 2;
  return {
    x: PADDING,
    y: top,
    w: Math.max(1, w - PADDING * 2),
    h: Math.max(1, bottom - top),
  };
};

export const chromeBands = (screen?: ScreenShape): ChromeBand[] => {
  const { w, h } = normalizeScreen(screen);
  const {
    APP_BUTTONS_BOTTOM,
    APP_BUTTONS_RIGHT,
    DOCK_FROM_BOTTOM,
    BOARD_BUTTONS_FROM_BOTTOM,
    BOARD_BUTTONS_WIDTH,
  } = BOARD_LAYOUT;
  const buttonsW = Math.min(BOARD_BUTTONS_WIDTH, w / 2);
  return [
    {
      id: 'app-buttons',
      x: 0,
      y: 0,
      w: Math.min(APP_BUTTONS_RIGHT, w),
      h: APP_BUTTONS_BOTTOM,
    },
    { id: 'dock', x: 0, y: h - DOCK_FROM_BOTTOM, w, h: DOCK_FROM_BOTTOM },
    {
      id: 'board-buttons-left',
      x: 0,
      y: h - BOARD_BUTTONS_FROM_BOTTOM,
      w: buttonsW,
      h: BOARD_BUTTONS_FROM_BOTTOM,
    },
    {
      id: 'board-buttons-right',
      x: w - buttonsW,
      y: h - BOARD_BUTTONS_FROM_BOTTOM,
      w: buttonsW,
      h: BOARD_BUTTONS_FROM_BOTTOM,
    },
  ];
};

const safeSize = (screen: ScreenShape) => ({
  safeW: Math.max(1, screen.w - BOARD_LAYOUT.PADDING * 2),
  safeH: Math.max(1, screen.h - BOARD_LAYOUT.PADDING * 2),
});

/** Stored geometry for a pixel rect, with the aspect ratio that fills it exactly on this screen. */
export const toPlacedRect = (rect: Rect, screen?: ScreenShape): PlacedRect => {
  const shape = normalizeScreen(screen);
  const { safeW, safeH } = safeSize(shape);
  const { PADDING } = BOARD_LAYOUT;
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
    xProp: (rect.x - PADDING) / safeW,
    yProp: (rect.y - PADDING) / safeH,
    wProp: rect.w / safeW,
    hProp: rect.h / safeH,
    aspectRatio: rect.w / Math.max(1, rect.h),
  };
};

export const zoneRect = (zone: SnapZone, screen?: ScreenShape): Rect => {
  const area = contentArea(screen);
  const half = BOARD_LAYOUT.GAP / 2;
  const left = zone.x > EDGE_EPSILON ? half : 0;
  const right = zone.x + zone.w < 1 - EDGE_EPSILON ? half : 0;
  const top = zone.y > EDGE_EPSILON ? half : 0;
  const bottom = zone.y + zone.h < 1 - EDGE_EPSILON ? half : 0;
  return {
    x: area.x + zone.x * area.w + left,
    y: area.y + zone.y * area.h + top,
    w: Math.max(1, zone.w * area.w - left - right),
    h: Math.max(1, zone.h * area.h - top - bottom),
  };
};

export const placeInZone = (zone: SnapZone, screen?: ScreenShape): PlacedRect =>
  toPlacedRect(zoneRect(zone, screen), screen);

// Keeps absurd stored or requested numbers from overflowing the layout math.
const MAX_COORD = 1e6;
const bound = (v: number, min: number) => Math.min(MAX_COORD, Math.max(min, v));
const boundRect = (r: Rect): Rect => ({
  x: bound(r.x, -MAX_COORD),
  y: bound(r.y, -MAX_COORD),
  w: bound(r.w, 0),
  h: bound(r.h, 0),
});

/** The widget's outer rect on this screen; null when it has no usable geometry. */
export const widgetRect = (
  widget: LayoutWidget,
  screen?: ScreenShape
): Rect | null => {
  const shape = normalizeScreen(screen);
  const { xProp, yProp, wProp, hProp } = widget;
  const finite = [xProp, yProp, wProp, hProp].every(
    (v) => typeof v === 'number' && Number.isFinite(v)
  );
  // Same range test as widgetNeedsProportionalMigration: out-of-range proportions are really pixels.
  if (
    finite &&
    Number(wProp) > 0 &&
    Number(wProp) <= 1.5 &&
    Number(hProp) > 0 &&
    Number(hProp) <= 1.5 &&
    Math.abs(Number(xProp)) <= 1.5 &&
    Math.abs(Number(yProp)) <= 1.5
  ) {
    const { safeW, safeH } = safeSize(shape);
    const { PADDING } = BOARD_LAYOUT;
    return boundRect({
      x: PADDING + Number(xProp) * safeW,
      y: PADDING + Number(yProp) * safeH,
      w: Number(wProp) * safeW,
      h: Number(hProp) * safeH,
    });
  }
  const { x, y, w, h } = widget;
  if ([x, y, w, h].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return boundRect({
      x: Number(x),
      y: Number(y),
      w: Number(w),
      h: Number(h),
    });
  }
  return null;
};

export const intersection = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right - x <= 0 || bottom - y <= 0) return null;
  return { x, y, w: right - x, h: bottom - y };
};
