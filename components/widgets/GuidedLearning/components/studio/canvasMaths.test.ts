import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import { buildStageGeometry } from '../../utils/stageGeometry';
import { screenScale } from './canvasScale';
import { snapMove, snapPoint, snapTargets } from './snapping';
import { FIT_VIEW, zoomAround } from './useCanvasViewport';
import {
  convertShape,
  dragBox,
  moveStep,
  nearestEdge,
  removeVertex,
  resizeBox,
  stepBox,
} from './regionEdits';

const step = (over: Partial<GuidedLearningStep>): GuidedLearningStep => ({
  id: 's',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  ...over,
});

describe('zoomAround', () => {
  it('keeps the point under the pointer fixed', () => {
    const at = { x: 300, y: 200 };
    const v = zoomAround(FIT_VIEW, 2, at);
    // A content point p sits at view.x + p * zoom on screen.
    const before = (at.x - FIT_VIEW.x) / FIT_VIEW.zoom;
    expect(v.x + before * v.zoom).toBeCloseTo(at.x);
    const w = zoomAround(v, 3, { x: 100, y: 50 });
    const p = (100 - v.x) / v.zoom;
    expect(w.x + p * w.zoom).toBeCloseTo(100);
    expect(w.y + ((50 - v.y) / v.zoom) * w.zoom).toBeCloseTo(50);
  });

  it('clamps to 100–400% and snaps back to fit at 100%', () => {
    expect(zoomAround(FIT_VIEW, 9, { x: 0, y: 0 }).zoom).toBe(4);
    expect(
      zoomAround({ zoom: 2, x: -50, y: -40 }, 0.5, { x: 5, y: 5 })
    ).toEqual(FIT_VIEW);
  });
});

describe('clientToImagePct under frame scale and canvas zoom', () => {
  // A 1000×500 container showing a 2:1 image, drawn at k=0.5 and canvas zoom 2 from (40, 30).
  const geometry = (k: number, zoom: number) =>
    buildStageGeometry({
      containerSize: { w: 1000, h: 500 },
      imgOffset: { left: 0, top: 0, scaleX: 1, scaleY: 1 },
      renderedTransform: { scale: 1, tx: 0, ty: 0 },
      getMediaRect: () =>
        ({
          left: 40,
          top: 30,
          width: 1000 * k * zoom,
          height: 500 * k * zoom,
        }) as DOMRect,
    });

  it('maps client px to image-% through both scales', () => {
    const g = geometry(0.5, 2);
    expect(g.clientToImagePct(40 + 250, 30 + 125)).toEqual({
      xPct: 25,
      yPct: 25,
    });
    const h = geometry(0.5, 3);
    expect(h.clientToImagePct(40 + 750, 30 + 375).xPct).toBeCloseTo(50);
  });

  it('converts image-% to screen px through k × zoom', () => {
    // 1% of a 1000px container is 10 container px, so 5 screen px at k=0.5 and 15 at k=0.5 × zoom 3.
    expect(screenScale(geometry(0.5, 1), 0.5).pxPerPct.x).toBeCloseTo(5);
    expect(screenScale(geometry(0.5, 3), 1.5).pxPerPct).toEqual({
      x: 15,
      y: 7.5,
    });
  });
});

describe('snapping', () => {
  const others = [
    step({
      id: 'a',
      xPct: 20,
      yPct: 20,
      region: { shape: 'rect', wPct: 10, hPct: 10 },
    }),
  ];
  const targets = snapTargets(others, 'moving');

  it('snaps the nearest edge or centre within the limit and reports guides', () => {
    // Left edge at 24.6 sits 0.4 from the other region's right edge at 25.
    const s = snapMove({ l: 24.6, r: 34.6, t: 60, b: 70 }, targets, {
      x: 0.5,
      y: 0.5,
    });
    expect(s.dx).toBeCloseTo(0.4);
    expect(s.guides.x).toBe(25);
    expect(s.dy).toBe(0);
    expect(s.guides.y).toBeNull();
  });

  it('snaps to the image centre lines and ignores targets beyond the limit', () => {
    const s = snapMove({ l: 40, r: 59.8, t: 10, b: 12 }, targets, {
      x: 0.5,
      y: 0.5,
    });
    expect(s.dx).toBeCloseTo(0.1);
    expect(s.guides.x).toBe(50);
    expect(
      snapPoint({ xPct: 60, yPct: 60 }, targets, { x: 0.5, y: 0.5 })
    ).toEqual({
      xPct: 60,
      yPct: 60,
      guides: { x: null, y: null },
    });
  });

  it('only snaps the axes a handle moves', () => {
    const p = snapPoint(
      { xPct: 25.2, yPct: 49.9 },
      targets,
      { x: 0.5, y: 0.5 },
      { x: true, y: false }
    );
    expect(p.xPct).toBeCloseTo(25);
    expect(p.yPct).toBe(49.9);
  });
});

describe('region edits', () => {
  const poly = step({
    xPct: 20,
    yPct: 20,
    region: {
      shape: 'polygon',
      wPct: 20,
      hPct: 20,
      points: [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 20, y: 30 },
      ],
    },
  });

  it('moves every polygon vertex by the same delta and keeps it on the image', () => {
    const moved = moveStep(poly, 5, 2);
    expect(moved.region?.points).toEqual([
      { x: 15, y: 12 },
      { x: 35, y: 12 },
      { x: 25, y: 32 },
    ]);
    expect(moved.xPct).toBe(25);
    expect(moved.yPct).toBe(22);
    const clamped = moveStep(poly, -50, 0);
    expect(clamped.region?.points?.[0]).toEqual({ x: 0, y: 10 });
    expect(stepBox(clamped).r).toBe(20);
  });

  it('resizes only the edges a handle owns, keeping the minimum size', () => {
    const box = { l: 10, t: 10, r: 30, b: 30 };
    expect(resizeBox(box, 'se', { xPct: 40, yPct: 35 })).toEqual({
      l: 10,
      t: 10,
      r: 40,
      b: 35,
    });
    expect(resizeBox(box, 'w', { xPct: 50, yPct: 0 }).l).toBe(28.5);
  });

  it('draws a square on screen with shift even when image-% are not square', () => {
    const b = dragBox({ xPct: 10, yPct: 10 }, { xPct: 20, yPct: 12 }, true, {
      x: 4,
      y: 8,
    });
    expect((b.r - b.l) * 4).toBeCloseTo((b.b - b.t) * 8);
  });

  it('keeps a square-locked drag on the image when squaring the short axis would overshoot the edge', () => {
    // a and b are already on-image; the drag itself never leaves 0-100. But
    // squaring the shorter axis to match the longer one's screen length can
    // still push it past 0-100 when the two axes scale very differently.
    const b = dragBox({ xPct: 90, yPct: 50 }, { xPct: 100, yPct: 100 }, true, {
      x: 2,
      y: 20,
    });
    expect(b.l).toBeGreaterThanOrEqual(0);
    expect(b.r).toBeLessThanOrEqual(100);
    expect(b.t).toBeGreaterThanOrEqual(0);
    expect(b.b).toBeLessThanOrEqual(100);
  });

  it('seeds 4 vertices from a rect and 12 from an ellipse', () => {
    const rect = step({ region: { shape: 'rect', wPct: 10, hPct: 10 } });
    expect(convertShape(rect, 'polygon').region?.points).toHaveLength(4);
    const ellipse = step({ region: { shape: 'ellipse', wPct: 10, hPct: 10 } });
    expect(convertShape(ellipse, 'polygon').region?.points).toHaveLength(12);
    expect(convertShape(rect, 'point').region).toBeUndefined();
  });

  it('keeps at least three vertices and finds the edge under the pointer', () => {
    const pts = poly.region?.points ?? [];
    expect(removeVertex(poly, 0)).toBe(poly);
    expect(
      nearestEdge(pts, { xPct: 20, yPct: 10.5 }, { x: 10, y: 10 }, 6)
    ).toBe(0);
    expect(
      nearestEdge(pts, { xPct: 20, yPct: 20 }, { x: 10, y: 10 }, 6)
    ).toBeNull();
  });
});
