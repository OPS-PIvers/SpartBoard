import { describe, expect, it } from 'vitest';
import { SNAPSHOT_MIN, SNAPSHOT_PAD_PX, snapshotCrop } from './stepSnapshot';

const viewport = { w: 1440, h: 900 };

describe('snapshotCrop', () => {
  it('grows a small control to the minimum picture, centred on it', () => {
    const crop = snapshotCrop(
      { x: 700, y: 430, width: 40, height: 40 },
      viewport
    );
    expect(crop).toEqual({
      x: 720 - SNAPSHOT_MIN.w / 2,
      y: 450 - SNAPSHOT_MIN.h / 2,
      width: SNAPSHOT_MIN.w,
      height: SNAPSHOT_MIN.h,
    });
  });

  it('keeps the picture on screen for a control in a corner', () => {
    const crop = snapshotCrop(
      { x: 4, y: 860, width: 32, height: 32 },
      viewport
    );
    expect(crop.x).toBe(0);
    expect(crop.y).toBe(viewport.h - SNAPSHOT_MIN.h);
  });

  it('pads a large control and never exceeds the viewport', () => {
    const crop = snapshotCrop(
      { x: 100, y: 100, width: 800, height: 500 },
      viewport
    );
    expect(crop.width).toBe(800 + SNAPSHOT_PAD_PX * 2);
    expect(crop.height).toBe(500 + SNAPSHOT_PAD_PX * 2);
    const whole = snapshotCrop(
      { x: 0, y: 0, width: 1440, height: 900 },
      viewport
    );
    expect(whole).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  });
});
