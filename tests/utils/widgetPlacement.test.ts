import { describe, expect, it } from 'vitest';
import {
  findWidgetPlacement,
  getVisibleBoardBounds,
} from '@/utils/widgetPlacement';

const VIEW = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };

describe('findWidgetPlacement', () => {
  it('centers the widget on an empty board', () => {
    expect(findWidgetPlacement({ w: 200, h: 100 }, [], VIEW)).toEqual({
      x: 400,
      y: 250,
    });
  });

  it('moves to the nearest open spot when the center is taken', () => {
    const center = { x: 400, y: 250, w: 200, h: 100 };
    const p = findWidgetPlacement({ w: 200, h: 100 }, [center], VIEW);
    const overlaps =
      p.x < center.x + center.w &&
      center.x < p.x + 200 &&
      p.y < center.y + center.h &&
      center.y < p.y + 100;
    expect(overlaps).toBe(false);
    // Nearest free spot sits flush beside the center widget, not in a corner.
    expect(Math.hypot(p.x + 100 - 500, p.y + 50 - 300)).toBeLessThan(250);
  });

  it('keeps the widget inside the visible area', () => {
    const occupied = [{ x: 300, y: 150, w: 400, h: 300 }];
    const p = findWidgetPlacement({ w: 250, h: 200 }, occupied, VIEW);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x + 250).toBeLessThanOrEqual(1000);
    expect(p.y + 200).toBeLessThanOrEqual(600);
  });

  it('cascades off the center when there is no free space', () => {
    const full = [{ x: 0, y: 0, w: 1000, h: 600 }];
    const first = findWidgetPlacement({ w: 200, h: 100 }, full, VIEW);
    expect(first).toEqual({ x: 400, y: 250 });
    const second = findWidgetPlacement(
      { w: 200, h: 100 },
      [...full, { ...first, w: 200, h: 100 }],
      VIEW
    );
    expect(second).toEqual({ x: 430, y: 280 });
  });

  it('pins an oversized widget to the top-left of the view', () => {
    expect(findWidgetPlacement({ w: 1200, h: 800 }, [], VIEW)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('getVisibleBoardBounds', () => {
  it('follows the camera when zoomed and panned', () => {
    const base = getVisibleBoardBounds(1920, 1080, {
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
    const zoomed = getVisibleBoardBounds(1920, 1080, {
      zoom: 2,
      pan: { x: 400, y: 0 },
    });
    expect(zoomed.maxX - zoomed.minX).toBeCloseTo((base.maxX - base.minX) / 2);
    // Panning right reveals the board's left side.
    expect((zoomed.minX + zoomed.maxX) / 2).toBeLessThan(
      (base.minX + base.maxX) / 2
    );
  });
});
