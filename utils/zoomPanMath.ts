// Pure geometry for the zoom + pan camera. All functions take vw/vh as
// parameters (no DOM access) so they're trivially testable.
//
// Coordinate system (origin: center-center, transform = translate × scale):
//   viewport_x = vw/2 + (wx − vw/2) × zoom + panX
//   wx        = vw/2 + (viewport_x − vw/2 − panX) / zoom
//
// Two distinct rectangles fall out of this:
//   • World bounds — where widgets are allowed to live. Sized to be fully
//     visible at ZOOM_MIN, so a widget placed anywhere inside survives the
//     most zoomed-out view.
//   • Pan range — how far the camera can scroll while keeping the visible
//     viewport region inside the world rectangle. Half the slack between
//     the world-as-rendered (vw × zoom / ZOOM_MIN) and the viewport.
//     Collapses to zero at zoom = ZOOM_MIN (world fills the viewport) and
//     grows monotonically with zoom. clampPan additionally snaps to (0, 0)
//     at zoom = 1 to preserve the FAB-reset-to-center UX.

import { ZOOM_MIN } from './zoomMapping';

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}

export const getWorldBounds = (vw: number, vh: number): Bounds => {
  const xPad = (vw * (1 / ZOOM_MIN - 1)) / 2;
  const yPad = (vh * (1 / ZOOM_MIN - 1)) / 2;
  return { minX: -xPad, maxX: vw + xPad, minY: -yPad, maxY: vh + yPad };
};

export const getPanRange = (zoom: number, vw: number, vh: number): Bounds => {
  // Half-slack between the world-as-rendered and the viewport, in viewport
  // pixels. Derivation: at zoom z, the world's rendered width is
  // vw × z / ZOOM_MIN; pan can shift the camera by (rendered − viewport) / 2
  // in each direction before the visible region exits the world.
  // Math.max(0, ...) is defensive — clampZoom prevents zoom < ZOOM_MIN.
  const halfX = Math.max(0, (vw * (zoom / ZOOM_MIN - 1)) / 2);
  const halfY = Math.max(0, (vh * (zoom / ZOOM_MIN - 1)) / 2);
  return { minX: -halfX, maxX: halfX, minY: -halfY, maxY: halfY };
};

export const clampPan = (
  pan: Point,
  zoom: number,
  vw: number,
  vh: number
): Point => {
  // Snap to center at zoom = 1 — the natural [0, vw] × [0, vh] content area
  // fits the viewport exactly, and the FAB-reset UX expects pan = (0, 0)
  // when the user returns to 100%.
  if (zoom === 1) return { x: 0, y: 0 };
  const r = getPanRange(zoom, vw, vh);
  return {
    x: Math.min(r.maxX, Math.max(r.minX, pan.x)),
    y: Math.min(r.maxY, Math.max(r.minY, pan.y)),
  };
};

// Clamp a widget so [x, x+w] × [y, y+h] sits inside the world rectangle.
// If the widget is wider/taller than the world (degenerate case on tiny
// viewports), pin to minX/minY rather than producing an inverted range.
export const clampWidgetToWorld = (
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number
): Point => {
  const b = getWorldBounds(vw, vh);
  const worldW = b.maxX - b.minX;
  const worldH = b.maxY - b.minY;
  const cx = w >= worldW ? b.minX : Math.min(b.maxX - w, Math.max(b.minX, x));
  const cy = h >= worldH ? b.minY : Math.min(b.maxY - h, Math.max(b.minY, y));
  return { x: cx, y: cy };
};

// Compute pan that keeps the wrapper-coordinate under the cursor stationary
// across a zoom change, then clamp to pan range.
//
// Solving viewport_x = vw/2 + (wx − vw/2) × z + panX for the new panX such
// that wx_under_cursor stays constant:
//   panX2 = cx − vw/2 − z2 × (cx − vw/2 − panX1) / z1
//
// When oldZoom === newZoom (caller hit the zoom cap and clamped) the formula
// returns oldPan exactly — no special-casing needed.
export const computeCursorAnchoredPan = (
  cursor: Point,
  oldZoom: number,
  oldPan: Point,
  newZoom: number,
  vw: number,
  vh: number
): Point => {
  const px =
    cursor.x - vw / 2 - (newZoom * (cursor.x - vw / 2 - oldPan.x)) / oldZoom;
  const py =
    cursor.y - vh / 2 - (newZoom * (cursor.y - vh / 2 - oldPan.y)) / oldZoom;
  return clampPan({ x: px, y: py }, newZoom, vw, vh);
};
