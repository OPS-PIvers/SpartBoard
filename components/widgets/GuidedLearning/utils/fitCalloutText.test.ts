import { describe, expect, it } from 'vitest';
import { fitCalloutText } from './fitCalloutText';
import {
  CALLOUT_TEXT_CAP_PX,
  CALLOUT_TEXT_FLOOR_PX,
  calloutBoxOf,
  calloutBoxRectPx,
  isValidCalloutBox,
  stepUsesCalloutBox,
} from './calloutStyle';

// A card whose height grows linearly with its body size, like wrapped text.
const linear =
  (perPx: number, padding = 0) =>
  (px: number) =>
    px * perPx + padding;

describe('fitCalloutText', () => {
  it('picks the largest body size that fits the box', () => {
    const fit = fitCalloutText({ boxH: 200, measure: linear(10) });
    expect(fit.overflow).toBe(false);
    expect(fit.heightPx).toBe(200);
    expect(fit.bodyPx).toBe(20);
  });

  it('gives a bigger size to a taller box', () => {
    const small = fitCalloutText({ boxH: 150, measure: linear(10, 20) });
    const large = fitCalloutText({ boxH: 300, measure: linear(10, 20) });
    expect(large.bodyPx).toBeGreaterThan(small.bodyPx);
  });

  it('stops at the cap when the text is short', () => {
    const fit = fitCalloutText({ boxH: 1000, measure: linear(2) });
    expect(fit).toEqual({
      bodyPx: CALLOUT_TEXT_CAP_PX,
      heightPx: 1000,
      overflow: false,
    });
  });

  it('grows the box at the floor when the text cannot fit', () => {
    const fit = fitCalloutText({ boxH: 50, measure: linear(10) });
    expect(fit).toEqual({
      bodyPx: CALLOUT_TEXT_FLOOR_PX,
      heightPx: CALLOUT_TEXT_FLOOR_PX * 10,
      overflow: true,
    });
  });

  it('is deterministic for the same box and measure', () => {
    const a = fitCalloutText({ boxH: 173, measure: linear(7.3, 11) });
    const b = fitCalloutText({ boxH: 173, measure: linear(7.3, 11) });
    expect(a).toEqual(b);
  });
});

describe('callout box helpers', () => {
  const box = { xPct: 10, yPct: 20, wPct: 30, hPct: 15 };

  it('validates the box', () => {
    expect(isValidCalloutBox(undefined)).toBe(true);
    expect(isValidCalloutBox(box)).toBe(true);
    expect(isValidCalloutBox({ ...box, xPct: -20 })).toBe(true);
    expect(isValidCalloutBox({ ...box, wPct: 0 })).toBe(false);
    expect(isValidCalloutBox({ ...box, hPct: Number.NaN })).toBe(false);
    expect(isValidCalloutBox({ xPct: 1, yPct: 1, wPct: 5 })).toBe(false);
    expect(isValidCalloutBox(null)).toBe(false);
  });

  it('clamps a stored box and ignores a malformed one', () => {
    expect(calloutBoxOf({ calloutBox: { ...box, wPct: 0 } })).toEqual({
      ...box,
      wPct: 1,
    });
    expect(
      calloutBoxOf({
        calloutBox: { ...box, xPct: 'x' as unknown as number },
      })
    ).toBeUndefined();
    expect(calloutBoxOf({})).toBeUndefined();
  });

  it('counts a box only on steps that draw a callout', () => {
    expect(
      stepUsesCalloutBox({ interactionType: 'tooltip', calloutBox: box })
    ).toBe(true);
    expect(
      stepUsesCalloutBox({ interactionType: 'question', calloutBox: box })
    ).toBe(false);
  });

  it('maps image-% to container px and keeps the box on the stage', () => {
    // Image fills 800x400 exactly.
    const toPx = (p: { xPct: number; yPct: number }) => ({
      x: p.xPct * 8,
      y: p.yPct * 4,
    });
    const container = { w: 800, h: 400 };
    expect(calloutBoxRectPx(box, toPx, container)).toEqual({
      x: 80,
      y: 80,
      w: 240,
      h: 60,
    });
    expect(
      calloutBoxRectPx({ ...box, xPct: -20, yPct: 95 }, toPx, container)
    ).toEqual({ x: 0, y: 340, w: 240, h: 60 });
    expect(
      calloutBoxRectPx({ ...box, wPct: 200 }, toPx, container)
    ).toMatchObject({ x: 0, w: 800 });
  });
});
