import { describe, expect, it } from 'vitest';
import {
  FIT_VIEW,
  pinchRatio,
  pinchView,
  settlePinch,
  type CanvasView,
} from './useCanvasViewport';
import { isDoubleTap } from './touchGestures';

// Content point under screen point s for view v.
const contentAt = (v: CanvasView, s: { x: number; y: number }) => ({
  x: (s.x - v.x) / v.zoom,
  y: (s.y - v.y) / v.zoom,
});

describe('pinch and two-finger pan', () => {
  it('zooms by the finger-spread ratio around the midpoint', () => {
    const a0 = { x: 100, y: 100 };
    const b0 = { x: 200, y: 100 };
    const a1 = { x: 50, y: 100 };
    const b1 = { x: 250, y: 100 };
    expect(pinchRatio(a0, b0, a1, b1)).toBeCloseTo(2);
    const v = pinchView(FIT_VIEW, a0, b0, a1, b1);
    expect(v.zoom).toBeCloseTo(2);
    expect(contentAt(v, { x: 150, y: 100 })).toEqual({ x: 150, y: 100 });
  });

  it('pans with the midpoint when the fingers keep their spread', () => {
    const v = pinchView(
      { zoom: 2, x: -40, y: -30 },
      { x: 100, y: 100 },
      { x: 200, y: 200 },
      { x: 130, y: 90 },
      { x: 230, y: 190 }
    );
    expect(v.zoom).toBeCloseTo(2);
    expect(v.x).toBeCloseTo(-10);
    expect(v.y).toBeCloseTo(-40);
  });

  it('keeps the start content under the moving midpoint while zooming and panning', () => {
    const start = { zoom: 1.5, x: -20, y: 10 };
    const v = pinchView(
      start,
      { x: 300, y: 200 },
      { x: 400, y: 260 },
      { x: 250, y: 150 },
      { x: 470, y: 282 }
    );
    const before = contentAt(start, { x: 350, y: 230 });
    const after = contentAt(v, { x: 360, y: 216 });
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps to 100–400%, and a pinch closed to 100% snaps back to fit', () => {
    const wide = pinchView(
      FIT_VIEW,
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    );
    expect(wide.zoom).toBe(4);
    const closed = pinchView(
      { zoom: 2, x: -100, y: -50 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 40, y: 0 },
      { x: 60, y: 0 }
    );
    expect(closed.zoom).toBe(1);
    expect(settlePinch(closed, 0.2)).toEqual(FIT_VIEW);
    // A two-finger pan at 100% keeps its offset.
    const panned = { zoom: 1, x: 30, y: 0 };
    expect(settlePinch(panned, 1)).toBe(panned);
    const zoomed = { zoom: 2, x: 5, y: 5 };
    expect(settlePinch(zoomed, 0.8)).toBe(zoomed);
  });

  it('treats a zero-spread start as no zoom', () => {
    const p = { x: 10, y: 10 };
    expect(pinchRatio(p, p, { x: 0, y: 0 }, { x: 50, y: 0 })).toBe(1);
  });
});

describe('isDoubleTap', () => {
  it('needs two taps within 350ms and 24px', () => {
    const first = { x: 100, y: 100, at: 1000 };
    expect(isDoubleTap(null, first)).toBe(false);
    expect(isDoubleTap(first, { x: 110, y: 105, at: 1200 })).toBe(true);
    expect(isDoubleTap(first, { x: 110, y: 105, at: 1400 })).toBe(false);
    expect(isDoubleTap(first, { x: 140, y: 100, at: 1100 })).toBe(false);
  });
});
