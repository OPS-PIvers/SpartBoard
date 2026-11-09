import { describe, expect, it } from 'vitest';
import { placePreviewTip, targetInPicture } from './pictureTarget';

const view = { w: 1000, h: 500 };

describe('targetInPicture', () => {
  it('is null without a recorded box', () => {
    expect(targetInPicture(undefined)).toBeNull();
    expect(targetInPicture({})).toBeNull();
    expect(targetInPicture({ box: { x: 0.1, y: 0.1, w: 0, h: 0.1 } })).toBe(
      null
    );
  });

  it('centres a target the crop had room around', () => {
    // 100x50 target in the middle of a 1000x500 viewport: crop 640x450.
    const r = targetInPicture(
      { box: { x: 0.45, y: 0.45, w: 0.1, h: 0.1 } },
      view
    );
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.x + r.w / 2).toBeCloseTo(0.5, 2);
    expect(r.y + r.h / 2).toBeCloseTo(0.5, 2);
    expect(r.w).toBeCloseTo(100 / 640, 3);
    expect(r.h).toBeCloseTo(50 / 450, 3);
  });

  it('keeps a target near the corner where the clamped crop put it', () => {
    const r = targetInPicture({ box: { x: 0, y: 0, w: 0.05, h: 0.05 } }, view);
    expect(r?.x).toBe(0);
    expect(r?.y).toBe(0);
  });

  it('stays inside the picture', () => {
    const r = targetInPicture(
      { box: { x: 0.9, y: 0.9, w: 0.5, h: 0.5 } },
      view
    );
    if (!r) throw new Error('no rect');
    expect(r.x + r.w).toBeLessThanOrEqual(1);
    expect(r.y + r.h).toBeLessThanOrEqual(1);
  });
});

describe('placePreviewTip', () => {
  it('goes below a target near the top, above one near the bottom', () => {
    const below = placePreviewTip(
      { x: 100, y: 50, width: 80, height: 30 },
      { w: 800, h: 600 },
      120
    );
    expect(below.top).toBe(50 + 30 + 24);
    const above = placePreviewTip(
      { x: 100, y: 500, width: 80, height: 30 },
      { w: 800, h: 600 },
      120
    );
    expect(above.bottom).toBe(600 - 500 + 24);
  });

  it('centres a tip with no target', () => {
    const tip = placePreviewTip(null, { w: 800, h: 600 }, 120);
    expect(tip.left).toBe((800 - 320) / 2);
  });
});
