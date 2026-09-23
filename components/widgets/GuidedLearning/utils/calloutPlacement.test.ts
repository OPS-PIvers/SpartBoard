import { describe, expect, it } from 'vitest';
import type { PxRect } from '../types/stage';
import {
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
