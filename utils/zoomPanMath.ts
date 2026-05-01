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
//   • Pan range — how far the camera can scroll. Symmetric on |zoom − 1|, so
//     pan collapses to zero at zoom = 1 (snap-to-center) and widens in either
//     direction as zoom moves away from 1.

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
  const halfX = (Math.abs(zoom - 1) * vw) / 2;
  const halfY = (Math.abs(zoom - 1) * vh) / 2;
  return { minX: -halfX, maxX: halfX, minY: -halfY, maxY: halfY };
};

export const clampPan = (
  pan: Point,
  zoom: number,
  vw: number,
  vh: number
): Point => {
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
