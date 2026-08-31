import { describe, expect, it } from 'vitest';
import {
  calculateImageFootprint,
  computePanZoomTranslate,
  toContainerCoords,
  toContainerSpotlightRadiusPct,
  toImageOffset,
} from './imageUtils';

describe('imageUtils', () => {
  it('calculates pillarboxed footprints for square images in wide containers', () => {
    expect(calculateImageFootprint(1000, 1000, 400, 200)).toEqual({
      width: 200,
      height: 200,
      offsetLeft: 100,
      offsetTop: 0,
    });
  });

  it('calculates letterboxed footprints for wide images in tall containers', () => {
    expect(calculateImageFootprint(1600, 900, 300, 400)).toEqual({
      width: 300,
      height: 168.75,
      offsetLeft: 0,
      offsetTop: 115.625,
    });
  });

  it('converts image-relative percentages back into container space', () => {
    const footprint = calculateImageFootprint(1000, 1000, 400, 200);
    const offset = toImageOffset(footprint, 400, 200);

    expect(offset).toEqual({
      left: 25,
      top: 0,
      scaleX: 0.5,
      scaleY: 1,
    });
    expect(toContainerCoords(10, 80, offset)).toEqual({
      xPct: 30,
      yPct: 80,
    });
  });

  it('returns null from toContainerCoords when the footprint is unmeasured', () => {
    expect(toContainerCoords(10, 80, null)).toBeNull();
  });

  it('converts an image-relative spotlight radius to container-relative', () => {
    // Square image in a 400x200 container: footprint 200x200, scaleX 0.5.
    const offset = toImageOffset(
      calculateImageFootprint(1000, 1000, 400, 200),
      400,
      200
    );
    // Image min dim 200 == container min dim 200 → unchanged.
    expect(toContainerSpotlightRadiusPct(25, offset, 400, 200)).toBe(25);

    // Wide image letterboxed in a tall container: footprint 300x168.75.
    const wide = toImageOffset(
      calculateImageFootprint(1600, 900, 300, 400),
      300,
      400
    );
    // Image min dim 168.75, container min dim 300 → radius shrinks.
    expect(toContainerSpotlightRadiusPct(20, wide, 300, 400)).toBeCloseTo(
      (20 * 168.75) / 300
    );
  });

  it('falls back to the raw radius when unmeasured', () => {
    expect(toContainerSpotlightRadiusPct(25, null, 400, 200)).toBe(25);
    expect(
      toContainerSpotlightRadiusPct(
        25,
        { left: 0, top: 0, scaleX: 1, scaleY: 1 },
        0,
        0
      )
    ).toBe(25);
  });

  it('computes the translation that centers a hotspot at a given scale', () => {
    // Centered hotspot needs no pan beyond the scale-induced shift.
    expect(computePanZoomTranslate(50, 50, 2, 400, 200)).toEqual({
      tx: 200 - 400,
      ty: 100 - 200,
    });
    // Top-left hotspot pans toward container center.
    expect(computePanZoomTranslate(0, 0, 2.5, 400, 200)).toEqual({
      tx: 200,
      ty: 100,
    });
  });
});
