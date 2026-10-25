import { describe, it, expect } from 'vitest';
import { type InkFrame, feedToInk, inkToFeed } from './docCamInk';

const frame = (over: Partial<InkFrame> = {}): InkFrame => ({
  feed: { width: 400, height: 300 },
  source: { width: 1280, height: 720 },
  view: { zoom: 1, rotation: 0, panX: 0, panY: 0 },
  mirrored: false,
  ...over,
});

describe('ink coordinates', () => {
  it('round-trips through zoom, pan, a turn and mirroring', () => {
    const f = frame({
      view: { zoom: 2, rotation: 90, panX: 30, panY: -20 },
      mirrored: true,
    });
    const p = feedToInk(123, 77, f);
    const back = inkToFeed(p, f);
    expect(back.x).toBeCloseTo(123);
    expect(back.y).toBeCloseTo(77);
  });

  it('keeps a mark on the same spot in the picture when the widget changes shape', () => {
    const p = feedToInk(0, 150, frame());
    // 16:9 camera in a 4:3 box is cropped at the sides; the left edge is not the frame's edge.
    expect(p.x).toBeGreaterThan(0.1);
    const wide = frame({ feed: { width: 1600, height: 900 } });
    const moved = inkToFeed(p, wide);
    expect(moved.x / 1600).toBeCloseTo(p.x);
    expect(moved.y / 900).toBeCloseTo(0.5);
  });

  it('moves a mark with the picture when zooming in', () => {
    const p = feedToInk(300, 150, frame());
    const zoomed = inkToFeed(
      p,
      frame({ view: { zoom: 2, rotation: 0, panX: 0, panY: 0 } })
    );
    expect(zoomed.x).toBeCloseTo(400);
  });
});
