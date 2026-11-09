import { describe, expect, it } from 'vitest';
import {
  MAX_MAGNIFY,
  placePreviewTip,
  stagePlacement,
  stageScale,
} from './pictureTarget';

// A 100x50 target in the middle of the assumed 1440x900 window: crop 640x450.
const centred = { x: 670 / 1440, y: 425 / 900, w: 100 / 1440, h: 50 / 900 };
const cropPicture = { w: 1280, h: 900 };

describe('stagePlacement', () => {
  it('uses the place the recorder stored, with its CSS width', () => {
    const p = stagePlacement(
      {
        w: 1280,
        h: 720,
        target: { x: 0.2, y: 0.3, w: 0.1, h: 0.05 },
        cssW: 640,
      },
      { box: centred }
    );
    expect(p).toEqual({
      rect: { x: 0.2, y: 0.3, w: 0.1, h: 0.05 },
      cssW: 640,
      source: 'recorded',
    });
  });

  it('estimates an older step when the crop it implies matches the picture', () => {
    const p = stagePlacement(cropPicture, { box: centred });
    expect(p.source).toBe('estimate');
    expect(p.cssW).toBe(640);
    if (!p.rect) throw new Error('no rect');
    expect(p.rect.x + p.rect.w / 2).toBeCloseTo(0.5, 3);
    expect(p.rect.y + p.rect.h / 2).toBeCloseTo(0.5, 3);
    expect(p.rect.w).toBeCloseTo(100 / 640, 3);
  });

  it('draws no ring when the picture is not the shape the estimate expects', () => {
    // Recorded in a narrower window: the real crop was clamped, so the shapes differ.
    const p = stagePlacement({ w: 1280, h: 720 }, { box: centred });
    expect(p.rect).toBeNull();
    expect(p.source).toBe('none');
  });

  it('draws no ring without a recorded box, or for an implausible one', () => {
    expect(stagePlacement(cropPicture, {}).rect).toBeNull();
    expect(stagePlacement(cropPicture, undefined).rect).toBeNull();
    expect(
      stagePlacement(cropPicture, { box: { x: 0, y: 0, w: 1, h: 1 } }).rect
    ).toBeNull();
    expect(
      stagePlacement(
        { ...cropPicture, target: { x: 0.9, y: 0.9, w: 0.5, h: 0.5 } },
        {}
      ).source
    ).toBe('none');
  });
});

describe('stageScale', () => {
  it('fits the room', () => {
    expect(stageScale({ w: 640, h: 450 }, 1280, { w: 960, h: 900 })).toBe(1.5);
    expect(stageScale({ w: 640, h: 450 }, 1280, { w: 320, h: 900 })).toBe(0.5);
  });

  it('never magnifies the picture past its limit', () => {
    // A 1x capture: 640 picture pixels shown 1.5x at most, however big the room.
    expect(stageScale({ w: 640, h: 450 }, 640, { w: 4000, h: 4000 })).toBe(
      MAX_MAGNIFY
    );
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
