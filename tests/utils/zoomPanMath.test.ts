import { describe, it, expect } from 'vitest';
import {
  clampPan,
  clampWidgetToWorld,
  computeCursorAnchoredPan,
  getPanRange,
  getWorldBounds,
} from '@/utils/zoomPanMath';
import { ZOOM_MIN } from '@/utils/zoomMapping';

// Forward transform from wrapper to viewport coords (origin: center-center).
// Used by the cursor-anchor invariant test.
const projectToViewport = (
  wx: number,
  wy: number,
  zoom: number,
  pan: { x: number; y: number },
  vw: number,
  vh: number
) => ({
  x: vw / 2 + (wx - vw / 2) * zoom + pan.x,
  y: vh / 2 + (wy - vh / 2) * zoom + pan.y,
});

const projectToWrapper = (
  cx: number,
  cy: number,
  zoom: number,
  pan: { x: number; y: number },
  vw: number,
  vh: number
) => ({
  x: vw / 2 + (cx - vw / 2 - pan.x) / zoom,
  y: vh / 2 + (cy - vh / 2 - pan.y) / zoom,
});

describe('zoomPanMath', () => {
  describe('getWorldBounds', () => {
    it('extends symmetrically around the natural [0, vw] × [0, vh] content area', () => {
      // ZOOM_MIN = 0.5 → padding = vw × (1/0.5 − 1)/2 = vw/2.
      expect(getWorldBounds(1000, 600)).toEqual({
        minX: -500,
        maxX: 1500,
        minY: -300,
        maxY: 900,
      });
    });

    it('matches the area visible at ZOOM_MIN (width = vw / ZOOM_MIN)', () => {
      const { minX, maxX } = getWorldBounds(1000, 600);
      expect(maxX - minX).toBeCloseTo(1000 / ZOOM_MIN, 5);
    });
  });

  describe('getPanRange', () => {
    it('collapses to (0, 0) at zoom = 1', () => {
      // The lower-bound arm produces -0; check magnitude not sign.
      const r = getPanRange(1, 1000, 600);
      expect(r.minX).toBeCloseTo(0, 10);
      expect(r.maxX).toBeCloseTo(0, 10);
      expect(r.minY).toBeCloseTo(0, 10);
      expect(r.maxY).toBeCloseTo(0, 10);
    });

    it('opens symmetrically as zoom moves above 1', () => {
      // (z − 1) × vw / 2 with z=2, vw=1000 → ±500
      expect(getPanRange(2, 1000, 600)).toEqual({
        minX: -500,
        maxX: 500,
        minY: -300,
        maxY: 300,
      });
    });

    it('opens symmetrically as zoom moves below 1', () => {
      // |0.5 − 1| × 1000 / 2 = 250
      expect(getPanRange(0.5, 1000, 600)).toEqual({
        minX: -250,
        maxX: 250,
        minY: -150,
        maxY: 150,
      });
    });
  });

  describe('clampPan', () => {
    it('passes through values inside the range', () => {
      expect(clampPan({ x: 100, y: -50 }, 2, 1000, 600)).toEqual({
        x: 100,
        y: -50,
      });
    });

    it('pins to the range boundary when outside', () => {
      // pan range at z=2 vw=1000 vh=600 is ±500 / ±300
      expect(clampPan({ x: 9999, y: -9999 }, 2, 1000, 600)).toEqual({
        x: 500,
        y: -300,
      });
    });

    it('snaps to (0, 0) at zoom = 1 regardless of input', () => {
      expect(clampPan({ x: 200, y: 200 }, 1, 1000, 600)).toEqual({
        x: 0,
        y: 0,
      });
    });
  });

  describe('clampWidgetToWorld', () => {
    it('passes a widget that already sits inside world bounds through unchanged', () => {
      // World at (1000, 600) is x ∈ [-500, 1500], y ∈ [-300, 900].
      expect(clampWidgetToWorld(100, 100, 200, 100, 1000, 600)).toEqual({
        x: 100,
        y: 100,
      });
    });

    it('pins a widget pushed past the left/top edges', () => {
      expect(clampWidgetToWorld(-600, -400, 100, 80, 1000, 600)).toEqual({
        x: -500,
        y: -300,
      });
    });

    it('pins a widget pushed past the right/bottom edges', () => {
      // Right edge: maxX (1500) − w (100) = 1400.
      expect(clampWidgetToWorld(1450, 850, 100, 80, 1000, 600)).toEqual({
        x: 1400,
        y: 820,
      });
    });

    it('pins to minX/minY when the widget is wider/taller than the world', () => {
      // World width = 2000; widget w = 5000.
      expect(clampWidgetToWorld(123, 0, 5000, 200, 1000, 600)).toEqual({
        x: -500,
        y: 0,
      });
    });
  });

  describe('computeCursorAnchoredPan', () => {
    it('returns oldPan unchanged when zoom does not change (cap behavior)', () => {
      const oldPan = { x: 42, y: -17 };
      expect(
        computeCursorAnchoredPan(
          { x: 800, y: 400 },
          1.5,
          oldPan,
          1.5,
          1000,
          600
        )
      ).toEqual(oldPan);
    });

    it('keeps the wrapper-coordinate under the cursor stationary across zoom', () => {
      // Pick a corner-ish cursor position so the anchor adjustment is non-trivial.
      const cursor = { x: 900, y: 500 };
      const oldZoom = 1;
      const oldPan = { x: 0, y: 0 };
      const newZoom = 2;
      const vw = 1000;
      const vh = 600;

      // Wrapper coord under cursor before the zoom change.
      const wrapperBefore = projectToWrapper(
        cursor.x,
        cursor.y,
        oldZoom,
        oldPan,
        vw,
        vh
      );

      const newPan = computeCursorAnchoredPan(
        cursor,
        oldZoom,
        oldPan,
        newZoom,
        vw,
        vh
      );

      // Re-project the same wrapper coord through the new (zoom, pan) — it
      // should land back at the cursor (within float epsilon) UNLESS
      // computeCursorAnchoredPan had to clamp to keep pan in range.
      const projectedBack = projectToViewport(
        wrapperBefore.x,
        wrapperBefore.y,
        newZoom,
        newPan,
        vw,
        vh
      );

      // For this case the unclamped pan stays inside ±vw/2 (half-range at z=2),
      // so the anchor invariant holds exactly.
      expect(projectedBack.x).toBeCloseTo(cursor.x, 5);
      expect(projectedBack.y).toBeCloseTo(cursor.y, 5);
    });

    it('clamps the resulting pan to its range when the unclamped result would overshoot', () => {
      // Tiny zoom change at the edge of the viewport can request pan far
      // outside the allowed range. Verify the result sits at the boundary,
      // not at the unclamped value.
      const cursor = { x: 1000, y: 600 };
      const oldZoom = 1;
      const oldPan = { x: 0, y: 0 };
      const newZoom = 1.05;
      const vw = 1000;
      const vh = 600;

      const result = computeCursorAnchoredPan(
        cursor,
        oldZoom,
        oldPan,
        newZoom,
        vw,
        vh
      );

      const range = getPanRange(newZoom, vw, vh);
      expect(result.x).toBeGreaterThanOrEqual(range.minX);
      expect(result.x).toBeLessThanOrEqual(range.maxX);
      expect(result.y).toBeGreaterThanOrEqual(range.minY);
      expect(result.y).toBeLessThanOrEqual(range.maxY);
    });
  });
});
