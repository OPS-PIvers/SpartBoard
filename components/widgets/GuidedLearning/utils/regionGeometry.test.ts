import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import {
  calculateImageFootprint,
  toImageOffset,
  type ImageOffset,
} from './imageUtils';
import {
  clampRegion,
  effectiveRegion,
  pinSizePx,
  pointInRegion,
  polygonBBox,
  regionPath,
  regionRect,
  type RegionGeometryInput,
} from './regionGeometry';

function geometry(
  cw: number,
  ch: number,
  iw: number,
  ih: number,
  transform = { scale: 1, tx: 0, ty: 0 }
): RegionGeometryInput {
  const imgOffset = toImageOffset(
    calculateImageFootprint(iw, ih, cw, ch),
    cw,
    ch
  ) as ImageOffset;
  return {
    containerSize: { w: cw, h: ch },
    imgOffset,
    renderedTransform: transform,
    imagePctToContainerPx: ({ xPct, yPct }) => ({
      x:
        ((imgOffset.left + xPct * imgOffset.scaleX) / 100) *
          cw *
          transform.scale +
        transform.tx,
      y:
        ((imgOffset.top + yPct * imgOffset.scaleY) / 100) *
          ch *
          transform.scale +
        transform.ty,
    }),
  };
}

const step = (over: Partial<GuidedLearningStep> = {}): GuidedLearningStep => ({
  id: 's',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  ...over,
});

describe('effectiveRegion', () => {
  it('defaults to the pin button footprint, matching min(32px, 8cqmin)', () => {
    const big = effectiveRegion(step(), geometry(800, 600, 1600, 900));
    expect(big.shape).toBe('pin');
    expect(big.w).toBe(32);
    expect(big.h).toBe(32);
    expect(big.cx).toBe(400);
    expect(big.cy).toBe(300);
    const small = effectiveRegion(step(), geometry(300, 200, 1600, 900));
    expect(small.w).toBeCloseTo(16);
    expect(pinSizePx({ w: 300, h: 200 })).toBeCloseTo(16);
  });

  it('scales the pin with the painted zoom', () => {
    const g = geometry(800, 600, 1600, 900, { scale: 2, tx: -400, ty: -300 });
    const r = effectiveRegion(step(), g);
    expect(r.w).toBe(64);
    expect(r.cx).toBe(400);
  });

  it('maps a rect region through the letterboxed image footprint', () => {
    // 1600x900 in 800x600 → image drawn 800x450, offset 75px from the top.
    const g = geometry(800, 600, 1600, 900);
    const r = effectiveRegion(
      step({
        xPct: 25,
        yPct: 50,
        region: { shape: 'rect', wPct: 10, hPct: 20, cornerPct: 50 },
      }),
      g
    );
    expect(r.shape).toBe('rect');
    expect(r.cx).toBeCloseTo(200);
    expect(r.cy).toBeCloseTo(300);
    expect(r.w).toBeCloseTo(80);
    expect(r.h).toBeCloseTo(90);
    expect(r.cornerPx).toBeCloseTo(40);
  });

  it('maps polygon points into container px', () => {
    const g = geometry(800, 600, 1600, 900);
    const r = effectiveRegion(
      step({
        region: {
          shape: 'polygon',
          wPct: 20,
          hPct: 20,
          points: [
            { x: 40, y: 40 },
            { x: 60, y: 40 },
            { x: 50, y: 60 },
          ],
        },
      }),
      g
    );
    expect(r.points?.[0].x).toBeCloseTo(320);
    expect(r.points?.[0].y).toBeCloseTo(75 + 180);
  });
});

describe('pointInRegion', () => {
  const base = { cx: 100, cy: 100, w: 100, h: 50 };

  it('tests ellipses and pins against the inscribed ellipse', () => {
    const e = { ...base, shape: 'ellipse' as const };
    expect(pointInRegion({ x: 100, y: 100 }, e)).toBe(true);
    expect(pointInRegion({ x: 149, y: 100 }, e)).toBe(true);
    expect(pointInRegion({ x: 145, y: 120 }, e)).toBe(false);
    expect(pointInRegion({ x: 100, y: 124 }, { ...e, shape: 'pin' })).toBe(
      true
    );
  });

  it('respects rounded rect corners', () => {
    const r = { ...base, shape: 'rect' as const, cornerPx: 20 };
    expect(pointInRegion({ x: 51, y: 76 }, r)).toBe(false);
    expect(pointInRegion({ x: 60, y: 90 }, r)).toBe(true);
    expect(pointInRegion({ x: 51, y: 76 }, { ...r, cornerPx: 0 })).toBe(true);
    expect(pointInRegion({ x: 160, y: 100 }, r)).toBe(false);
  });

  it('tests polygons with ray casting, including a concave shape', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 50, y: 40 },
      { x: 0, y: 100 },
    ];
    const poly = {
      cx: 50,
      cy: 50,
      w: 100,
      h: 100,
      shape: 'polygon' as const,
      points,
    };
    expect(pointInRegion({ x: 20, y: 20 }, poly)).toBe(true);
    expect(pointInRegion({ x: 50, y: 80 }, poly)).toBe(false);
    expect(pointInRegion({ x: 150, y: 50 }, poly)).toBe(false);
  });
});

describe('regionPath', () => {
  it('draws a closed path for each shape', () => {
    const rect = regionPath({
      cx: 50,
      cy: 50,
      w: 40,
      h: 20,
      shape: 'rect',
      cornerPx: 5,
    });
    expect(rect.startsWith('M35,40')).toBe(true);
    expect(rect).toContain('A5,5');
    expect(rect.endsWith('Z')).toBe(true);
    expect(regionPath({ cx: 50, cy: 50, w: 40, h: 20, shape: 'rect' })).toBe(
      'M30,40 H70 V60 H30 Z'
    );
    expect(
      regionPath({ cx: 50, cy: 50, w: 40, h: 20, shape: 'ellipse' })
    ).toContain('A20,10');
    expect(
      regionPath({
        cx: 0,
        cy: 0,
        w: 0,
        h: 0,
        shape: 'polygon',
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
          { x: 5, y: 0 },
        ],
      })
    ).toBe('M1,2 L3,4 L5,0 Z');
  });
});

describe('polygonBBox and regionRect', () => {
  it('derives centre and size from vertices', () => {
    expect(
      polygonBBox([
        { x: 10, y: 20 },
        { x: 30, y: 60 },
        { x: 20, y: 40 },
      ])
    ).toEqual({ xPct: 20, yPct: 40, wPct: 20, hPct: 40 });
    expect(regionRect({ cx: 50, cy: 40, w: 20, h: 10, shape: 'rect' })).toEqual(
      { x: 40, y: 35, w: 20, h: 10 }
    );
  });
});

describe('clampRegion', () => {
  it('keeps a rect inside the image with a minimum size', () => {
    const out = clampRegion(
      { xPct: 99.9, yPct: -5 },
      { shape: 'rect', wPct: 0.2, hPct: 10, cornerPct: 80 }
    );
    expect(out.region.wPct).toBe(1.5);
    expect(out.region.cornerPct).toBe(50);
    expect(out.centre.xPct).toBeCloseTo(99.25);
    expect(out.centre.yPct).toBe(5);
  });

  it('allows a region to touch the image edge', () => {
    const out = clampRegion(
      { xPct: 5, yPct: 50 },
      { shape: 'ellipse', wPct: 10, hPct: 10 }
    );
    expect(out.centre.xPct).toBe(5);
  });

  it('translates a polygon back inside and recomputes its bbox', () => {
    const out = clampRegion(
      { xPct: 100, yPct: 50 },
      {
        shape: 'polygon',
        wPct: 20,
        hPct: 20,
        points: [
          { x: 90, y: 40 },
          { x: 110, y: 40 },
          { x: 100, y: 60 },
        ],
      }
    );
    expect(out.region.points).toEqual([
      { x: 80, y: 40 },
      { x: 100, y: 40 },
      { x: 90, y: 60 },
    ]);
    expect(out.centre).toEqual({ xPct: 90, yPct: 50 });
  });
});
