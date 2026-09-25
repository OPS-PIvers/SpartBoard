import { describe, expect, it } from 'vitest';
import type { PxRect } from '../types/stage';
import {
  arrowBetween,
  leaderCurve,
  placeBanner,
  placeCallout,
  placePopover,
  rectOverlapArea,
} from './calloutPlacement';

const CONTAINERS = [
  { w: 720, h: 520 },
  { w: 1024, h: 576 },
  { w: 1366, h: 657 },
  { w: 1920, h: 1080 },
  { w: 420, h: 760 },
];
const TARGET_SIZES = [
  { w: 32, h: 32 },
  { w: 140, h: 70 },
];
const BOXES = [
  { w: 240, h: 80 },
  { w: 300, h: 120 },
];

describe('placeCallout (auto)', () => {
  it('never overlaps its target across positions, sizes and container aspects', () => {
    let checked = 0;
    for (const container of CONTAINERS) {
      for (const size of TARGET_SIZES) {
        for (const box of BOXES) {
          for (let fx = 0.05; fx < 1; fx += 0.1) {
            for (let fy = 0.05; fy < 1; fy += 0.1) {
              const target: PxRect = {
                x: container.w * fx - size.w / 2,
                y: container.h * fy - size.h / 2,
                w: size.w,
                h: size.h,
              };
              const p = placeCallout({ box, target, container });
              const rect = { x: p.left, y: p.top, w: p.width, h: box.h };
              expect(rectOverlapArea(rect, target)).toBe(0);
              expect(p.left).toBeGreaterThanOrEqual(12);
              expect(p.left + p.width).toBeLessThanOrEqual(container.w - 12);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBe(CONTAINERS.length * 2 * 2 * 100);
  });

  it('keeps the offset gap on the chosen side', () => {
    const target = { x: 300, y: 100, w: 40, h: 40 };
    const p = placeCallout({
      box: { w: 200, h: 80 },
      target,
      container: { w: 720, h: 520 },
    });
    expect(p.side).toBe('bottom');
    expect(p.top).toBe(target.y + target.h + 16);
    expect(p.arrow.to.y).toBe(target.y + target.h);
    expect(p.arrow.from.y).toBe(p.top);
  });

  it('honours the preferred side when it fits', () => {
    const p = placeCallout({
      box: { w: 200, h: 80 },
      target: { x: 400, y: 200, w: 40, h: 40 },
      container: { w: 1024, h: 576 },
      prefer: 'left',
    });
    expect(p.side).toBe('left');
    expect(p.left + 200).toBe(400 - 16);
  });

  it('falls through when the preferred side has no room', () => {
    const p = placeCallout({
      box: { w: 200, h: 80 },
      target: { x: 20, y: 200, w: 40, h: 40 },
      container: { w: 1024, h: 576 },
      prefer: 'left',
    });
    expect(p.side).not.toBe('left');
  });

  it('shrinks the width before accepting overlap', () => {
    const target = { x: 300, y: 50, w: 100, h: 200 };
    const p = placeCallout({
      box: { w: 380, h: 60 },
      target,
      container: { w: 700, h: 300 },
    });
    expect(p.side).toBe('right');
    expect(p.width).toBe(272);
    expect(
      rectOverlapArea({ x: p.left, y: p.top, w: p.width, h: 84 }, target)
    ).toBe(0);
  });

  it('accepts the least overlap when nothing fits, staying inside the container', () => {
    const target = { x: 100, y: 50, w: 100, h: 100 };
    const container = { w: 300, h: 200 };
    const p = placeCallout({ box: { w: 280, h: 150 }, target, container });
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top).toBeGreaterThanOrEqual(0);
    const centred = { x: 10, y: 25, w: 280, h: 150 };
    expect(
      rectOverlapArea({ x: p.left, y: p.top, w: p.width, h: 150 }, target)
    ).toBeLessThanOrEqual(rectOverlapArea(centred, target));
  });
});

describe('placeCallout (pinned)', () => {
  it('centres the box on the pin and clamps it into the container', () => {
    const target = { x: 500, y: 300, w: 40, h: 40 };
    const container = { w: 720, h: 520 };
    const free = placeCallout({
      box: { w: 200, h: 100 },
      target,
      container,
      pinned: { x: 200, y: 150 },
    });
    expect(free.left).toBe(100);
    expect(free.top).toBe(100);
    expect(free.side).toBe('left');
    expect(free.arrow.from).toEqual({ x: 300, y: 200 });
    expect(free.arrow.to).toEqual({ x: 500, y: 300 });

    const clamped = placeCallout({
      box: { w: 200, h: 100 },
      target,
      container,
      pinned: { x: 5, y: 515 },
    });
    expect(clamped.left).toBe(12);
    expect(clamped.top).toBe(520 - 12 - 100);
  });
});

describe('placeBanner', () => {
  it('flips to the bottom for targets in the top 40%', () => {
    const c = { w: 800, h: 500 };
    expect(placeBanner({ x: 0, y: 20, w: 40, h: 40 }, c)).toBe('bottom');
    expect(placeBanner({ x: 0, y: 170, w: 40, h: 40 }, c)).toBe('bottom');
    expect(placeBanner({ x: 0, y: 180, w: 40, h: 40 }, c)).toBe('top');
    expect(placeBanner({ x: 0, y: 450, w: 40, h: 40 }, c)).toBe('top');
  });
});

describe('placePopover', () => {
  const container = { w: 800, h: 600 };
  const box = { w: 300, h: 200 };

  it('stays centred when that leaves the target clear', () => {
    expect(
      placePopover(box, { x: 20, y: 20, w: 40, h: 40 }, container)
    ).toEqual({ left: 250, top: 200 });
  });

  it('moves off a target under the centre', () => {
    const target = { x: 380, y: 280, w: 40, h: 40 };
    const p = placePopover(box, target, container);
    expect(
      rectOverlapArea({ x: p.left, y: p.top, w: 300, h: 200 }, target)
    ).toBe(0);
  });

  it('picks the quadrant away from an off-centre target', () => {
    const target = { x: 420, y: 320, w: 200, h: 150 };
    const p = placePopover(box, target, container);
    expect(p.left + 150).toBeLessThan(400);
    expect(p.top + 100).toBeLessThan(300);
  });
});

describe('arrowBetween normal', () => {
  const box: PxRect = { x: 100, y: 100, w: 200, h: 80 };

  it('points out of the bottom edge for a target below', () => {
    const a = arrowBetween(box, { x: 180, y: 300, w: 20, h: 20 });
    expect(a.from).toEqual({ x: 190, y: 180 });
    expect(a.normal).toEqual({ x: 0, y: 1 });
  });

  it('points out of the left edge for a target to the left', () => {
    const a = arrowBetween(box, { x: 0, y: 130, w: 20, h: 20 });
    expect(a.normal).toEqual({ x: -1, y: 0 });
  });

  it('picks the axis facing the target at a corner', () => {
    // Up-right of the box, further right than up.
    const a = arrowBetween(box, { x: 500, y: 60, w: 10, h: 10 });
    expect(a.from).toEqual({ x: 300, y: 100 });
    expect(a.normal).toEqual({ x: 1, y: 0 });
  });
});

describe('leaderCurve', () => {
  it('leaves along the normal and ends heading into the target', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 200, y: 200 };
    const { c1, c2, endTangent } = leaderCurve(from, { x: 0, y: 1 }, to);
    const d = 0.4 * Math.hypot(200, 200);
    expect(c1.x).toBeCloseTo(0);
    expect(c1.y).toBeCloseTo(d);
    // c2 sits on the segment from the target back toward c1.
    const back = Math.hypot(c1.x - c2.x, c1.y - c2.y);
    const whole = Math.hypot(c1.x - to.x, c1.y - to.y);
    expect(back + d).toBeCloseTo(whole);
    expect(Math.hypot(endTangent.x, endTangent.y)).toBeCloseTo(1);
    expect(endTangent.x).toBeGreaterThan(0);
  });

  it('keeps short lines almost straight', () => {
    const { c1 } = leaderCurve({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 0 });
    expect(Math.hypot(c1.x, c1.y)).toBeLessThan(1);
  });

  it('is deterministic', () => {
    const args = [
      { x: 3, y: 4 },
      { x: 1, y: 0 },
      { x: 90, y: -30 },
    ] as const;
    expect(leaderCurve(...args)).toEqual(leaderCurve(...args));
  });
});

describe('placeCallout obstacles', () => {
  const container = { w: 1200, h: 800 };
  const box = { w: 300, h: 120 };
  const target: PxRect = { x: 550, y: 300, w: 100, h: 40 };

  it('prefers below the target with nothing in the way', () => {
    expect(placeCallout({ box, target, container }).side).toBe('bottom');
  });

  it('moves off a dock that sits where it would go', () => {
    const dock: PxRect = { x: 300, y: 350, w: 600, h: 200 };
    const p = placeCallout({ box, target, container, obstacles: [dock] });
    expect(p.side).not.toBe('bottom');
    const rect = { x: p.left, y: p.top, w: p.width, h: box.h };
    expect(rectOverlapArea(rect, dock)).toBe(0);
    expect(rectOverlapArea(rect, target)).toBe(0);
  });

  it('never trades the target for an obstacle', () => {
    const everywhere: PxRect = { x: 0, y: 0, w: 1200, h: 800 };
    const p = placeCallout({
      box,
      target,
      container,
      obstacles: [everywhere],
    });
    const rect = { x: p.left, y: p.top, w: p.width, h: box.h };
    expect(rectOverlapArea(rect, target)).toBe(0);
  });
});
