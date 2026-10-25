import type { CSSProperties } from 'react';
import type { DrawableObject, Point } from '@/types';
import { getStrokedBoundingBox } from './hitTest';

/** Per-page zoom and pan. Box px = page px * zoom + (x, y); box px are canvasSize units. */
export interface DrawingView {
  zoom: number;
  x: number;
  y: number;
}

export const IDENTITY_VIEW: DrawingView = { zoom: 1, x: 0, y: 0 };
export const MIN_VIEW_ZOOM = 0.25;
export const MAX_VIEW_ZOOM = 4;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const FIT_PADDING = 16;

export const clampViewZoom = (z: number): number =>
  Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, z));

export const isIdentityView = (v: DrawingView): boolean =>
  v.zoom === 1 && v.x === 0 && v.y === 0;

/** Zooms to `zoom` keeping box point `at` fixed on screen. */
export const zoomViewAround = (
  view: DrawingView,
  zoom: number,
  at: Point
): DrawingView => {
  const z = clampViewZoom(zoom);
  const f = z / view.zoom;
  return {
    zoom: z,
    x: at.x - (at.x - view.x) * f,
    y: at.y - (at.y - view.y) * f,
  };
};

/** Next preset zoom up or down from the current one. */
export const steppedZoom = (zoom: number, dir: 1 | -1): number =>
  dir > 0
    ? (ZOOM_STEPS.find((s) => s > zoom + 0.001) ?? MAX_VIEW_ZOOM)
    : ([...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.001) ??
      MIN_VIEW_ZOOM);

/** Trackpad pinch arrives as ctrl+wheel; one mouse notch is about 18%. */
export const wheelZoomFactor = (deltaY: number): number =>
  Math.exp(-deltaY * 0.002);

const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/** Pinch plus two-finger pan; the page point under the start midpoint stays under the fingers. */
export const pinchView = (
  start: DrawingView,
  a0: Point,
  b0: Point,
  a1: Point,
  b1: Point
): DrawingView => {
  const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
  const ratio = d0 > 0 ? Math.hypot(a1.x - b1.x, a1.y - b1.y) / d0 : 1;
  const zoom = clampViewZoom(start.zoom * ratio);
  const m0 = midpoint(a0, b0);
  const m1 = midpoint(a1, b1);
  return {
    zoom,
    x: m1.x - ((m0.x - start.x) / start.zoom) * zoom,
    y: m1.y - ((m0.y - start.y) / start.zoom) * zoom,
  };
};

/** Client px to box px; `rect` is the canvas's bounding rect, which absorbs any board zoom. */
export const clientToBox = (
  rect: { left: number; top: number; width: number; height: number },
  canvasSize: { width: number; height: number },
  clientX: number,
  clientY: number
): Point => ({
  x:
    rect.width > 0
      ? ((clientX - rect.left) * canvasSize.width) / rect.width
      : 0,
  y:
    rect.height > 0
      ? ((clientY - rect.top) * canvasSize.height) / rect.height
      : 0,
});

export const boxToPage = (view: DrawingView, p: Point): Point => ({
  x: (p.x - view.x) / view.zoom,
  y: (p.y - view.y) / view.zoom,
});

/** The page rectangle currently on screen. */
export const visiblePageArea = (
  view: DrawingView,
  canvasSize: { width: number; height: number }
): { x: number; y: number; width: number; height: number } => ({
  x: -view.x / view.zoom,
  y: -view.y / view.zoom,
  width: canvasSize.width / view.zoom,
  height: canvasSize.height / view.zoom,
});

/** Screen rect the page (0..canvasSize) occupies, for overlays positioned in page units. */
export const pageScreenRect = (
  rect: DOMRect,
  canvasSize: { width: number; height: number },
  view: DrawingView
): DOMRect => {
  const sx = canvasSize.width > 0 ? rect.width / canvasSize.width : 1;
  const sy = canvasSize.height > 0 ? rect.height / canvasSize.height : 1;
  return new DOMRect(
    rect.left + view.x * sx,
    rect.top + view.y * sy,
    canvasSize.width * view.zoom * sx,
    canvasSize.height * view.zoom * sy
  );
};

/** Shows the whole page and every object; a page with nothing outside it returns 100%. */
export const fitView = (
  objects: readonly DrawableObject[],
  canvasSize: { width: number; height: number }
): DrawingView => {
  const { width, height } = canvasSize;
  if (width <= 0 || height <= 0) return IDENTITY_VIEW;
  let minX = 0;
  let minY = 0;
  let maxX = width;
  let maxY = height;
  for (const obj of objects) {
    const b = getStrokedBoundingBox(obj);
    if (!b) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  if (minX >= 0 && minY >= 0 && maxX <= width && maxY <= height) {
    return IDENTITY_VIEW;
  }
  const zoom = clampViewZoom(
    Math.min(
      (width - FIT_PADDING * 2) / (maxX - minX),
      (height - FIT_PADDING * 2) / (maxY - minY)
    )
  );
  return {
    zoom,
    x: width / 2 - ((minX + maxX) / 2) * zoom,
    y: height / 2 - ((minY + maxY) / 2) * zoom,
  };
};

/** Scales and offsets a background template's tile so it moves with the page. */
export const viewBackgroundStyle = (
  style: CSSProperties,
  view: DrawingView,
  layoutRatio = 1
): CSSProperties => {
  const size = style.backgroundSize;
  if (typeof size !== 'string') return style;
  const scaled = size
    .split(' ')
    .map((part) =>
      part.endsWith('px')
        ? `${parseFloat(part) * view.zoom * layoutRatio}px`
        : part
    )
    .join(' ');
  return {
    ...style,
    backgroundSize: scaled,
    backgroundPosition: `${view.x * layoutRatio}px ${view.y * layoutRatio}px`,
  };
};
