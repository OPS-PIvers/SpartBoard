import { describe, it, expect } from 'vitest';
import {
  REFERENCE_VIEWPORT,
  MIN_PIXEL_W,
  MIN_PIXEL_H,
  pixelToProp,
  propToPixel,
  fitAspectInside,
  applyMinSize,
  computeWidgetPixelRect,
  getSafeViewport,
} from '@/utils/proportionalLayout';
import { SNAP_LAYOUT_CONSTANTS } from '@/utils/layoutMath';

const PADDING = SNAP_LAYOUT_CONSTANTS.PADDING;

describe('getSafeViewport', () => {
  it('subtracts PADDING from each side', () => {
    const { safeW, safeH, padding } = getSafeViewport(1920, 1080);
    expect(safeW).toBe(1920 - PADDING * 2);
    expect(safeH).toBe(1080 - PADDING * 2);
    expect(padding).toBe(PADDING);
  });

  it('clamps degenerate viewports to a minimum of 1', () => {
    const { safeW, safeH } = getSafeViewport(10, 10);
    expect(safeW).toBeGreaterThanOrEqual(1);
    expect(safeH).toBeGreaterThanOrEqual(1);
  });
});

describe('pixelToProp / propToPixel round-trip', () => {
  it('round-trips arbitrary rects without drift', () => {
    const vpW = 1920;
    const vpH = 1080;
    const original = { x: 200, y: 150, w: 480, h: 320 };
    const prop = pixelToProp(original, vpW, vpH);
    const roundTripped = propToPixel(prop, vpW, vpH);
    expect(roundTripped.x).toBeCloseTo(original.x, 6);
    expect(roundTripped.y).toBeCloseTo(original.y, 6);
    expect(roundTripped.w).toBeCloseTo(original.w, 6);
    expect(roundTripped.h).toBeCloseTo(original.h, 6);
  });

  it('reproduces the same proportions across viewports of different sizes', () => {
    // A widget at 30% width/height on a 1920x1080 board…
    const propA = pixelToProp(
      {
        x: 0,
        y: 0,
        w: 0.3 * (1920 - PADDING * 2),
        h: 0.3 * (1080 - PADDING * 2),
      },
      1920,
      1080
    );
    // …should occupy the same proportions even when rounded through pixels
    expect(propA.wProp).toBeCloseTo(0.3, 6);
    expect(propA.hProp).toBeCloseTo(0.3, 6);

    // And resolving to pixels at a different viewport scales linearly.
    const pixelsB = propToPixel(propA, 1366, 768);
    expect(pixelsB.w).toBeCloseTo(0.3 * (1366 - PADDING * 2), 6);
    expect(pixelsB.h).toBeCloseTo(0.3 * (768 - PADDING * 2), 6);
  });

  it('handles widgets positioned at the safe-area origin', () => {
    const prop = pixelToProp(
      { x: PADDING, y: PADDING, w: 100, h: 100 },
      1920,
      1080
    );
    expect(prop.xProp).toBeCloseTo(0, 6);
    expect(prop.yProp).toBeCloseTo(0, 6);
  });
});

describe('fitAspectInside', () => {
  it('squares fit cleanly inside taller rects', () => {
    const fitted = fitAspectInside({ x: 0, y: 0, w: 100, h: 200 }, 1);
    expect(fitted.w).toBe(100);
    expect(fitted.h).toBe(100);
    expect(fitted.x).toBe(0);
    expect(fitted.y).toBe(50); // centered vertically
  });

  it('squares fit cleanly inside wider rects', () => {
    const fitted = fitAspectInside({ x: 0, y: 0, w: 300, h: 100 }, 1);
    expect(fitted.w).toBe(100);
    expect(fitted.h).toBe(100);
    expect(fitted.x).toBe(100); // centered horizontally
    expect(fitted.y).toBe(0);
  });

  it('preserves a 16:9 ratio inside a portrait rect', () => {
    const fitted = fitAspectInside({ x: 0, y: 0, w: 200, h: 400 }, 16 / 9);
    expect(fitted.w).toBe(200);
    expect(fitted.h).toBeCloseTo(112.5, 4);
    expect(fitted.x).toBe(0);
    expect(fitted.y).toBeCloseTo((400 - 112.5) / 2, 4);
  });

  it('preserves a 16:9 ratio inside a landscape rect', () => {
    const fitted = fitAspectInside({ x: 0, y: 0, w: 400, h: 100 }, 16 / 9);
    expect(fitted.h).toBe(100);
    expect(fitted.w).toBeCloseTo(177.78, 1);
    expect(fitted.y).toBe(0);
    expect(fitted.x).toBeCloseTo((400 - 177.78) / 2, 1);
  });

  it('returns the outer rect unchanged when aspect ratio is invalid', () => {
    const outer = { x: 10, y: 20, w: 300, h: 200 };
    expect(fitAspectInside(outer, 0)).toEqual(outer);
    expect(fitAspectInside(outer, NaN)).toEqual(outer);
    expect(fitAspectInside(outer, -1)).toEqual(outer);
  });
});

describe('applyMinSize', () => {
  it('clamps undersized rects up to the floor', () => {
    const out = applyMinSize({ x: 0, y: 0, w: 50, h: 30 });
    expect(out.w).toBe(MIN_PIXEL_W);
    expect(out.h).toBe(MIN_PIXEL_H);
  });

  it('leaves rects above the floor unchanged', () => {
    const rect = { x: 0, y: 0, w: 200, h: 200 };
    expect(applyMinSize(rect)).toEqual(rect);
  });

  it('honors per-call min overrides', () => {
    const out = applyMinSize({ x: 0, y: 0, w: 30, h: 30 }, 50, 50);
    expect(out.w).toBe(50);
    expect(out.h).toBe(50);
  });
});

describe('computeWidgetPixelRect', () => {
  it('rounds pixel output', () => {
    const rect = computeWidgetPixelRect(
      { xProp: 0.123456, yProp: 0.234567, wProp: 0.345678, hProp: 0.456789 },
      1920,
      1080,
      'fill'
    );
    expect(Number.isInteger(rect.x)).toBe(true);
    expect(Number.isInteger(rect.y)).toBe(true);
    expect(Number.isInteger(rect.w)).toBe(true);
    expect(Number.isInteger(rect.h)).toBe(true);
  });

  it("'fill' mode does not aspect-fit", () => {
    // Square widget, but on a portrait viewport
    const rect = computeWidgetPixelRect(
      { xProp: 0, yProp: 0, wProp: 0.5, hProp: 0.5, aspectRatio: 1 },
      1000,
      2000,
      'fill'
    );
    // wProp * safeW vs hProp * safeH — neither is forced to match the other
    const { safeW, safeH } = getSafeViewport(1000, 2000);
    expect(rect.w).toBe(Math.round(0.5 * safeW));
    expect(rect.h).toBe(Math.round(0.5 * safeH));
  });

  it("'preserve-aspect' mode shrinks to fit a square inside a wide outer rect", () => {
    // A 1:1 widget placed in a rect that, on a 16:9 viewport, ends up wider
    // than tall. The pixel rect should keep the 1:1 visual shape.
    const rect = computeWidgetPixelRect(
      { xProp: 0, yProp: 0, wProp: 0.5, hProp: 0.5, aspectRatio: 1 },
      2000,
      500,
      'preserve-aspect'
    );
    // The fitted square is min(outerW, outerH)
    expect(rect.w).toBe(rect.h);
  });

  it('falls back to fill when aspectRatio is missing', () => {
    const { safeW, safeH } = getSafeViewport(1920, 1080);
    const rect = computeWidgetPixelRect(
      { xProp: 0, yProp: 0, wProp: 0.5, hProp: 0.25 },
      1920,
      1080,
      'preserve-aspect'
    );
    expect(rect.w).toBe(Math.round(0.5 * safeW));
    expect(rect.h).toBe(Math.round(0.25 * safeH));
  });

  it('applies min-size floor when proportional rect is tiny', () => {
    const rect = computeWidgetPixelRect(
      { xProp: 0, yProp: 0, wProp: 0.001, hProp: 0.001 },
      1920,
      1080,
      'fill'
    );
    expect(rect.w).toBeGreaterThanOrEqual(MIN_PIXEL_W);
    expect(rect.h).toBeGreaterThanOrEqual(MIN_PIXEL_H);
  });
});

describe('REFERENCE_VIEWPORT', () => {
  it('matches a 1920x1080 (16:9) reference', () => {
    expect(REFERENCE_VIEWPORT.w).toBe(1920);
    expect(REFERENCE_VIEWPORT.h).toBe(1080);
  });
});
