import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import {
  CALLOUT_HANDLES,
  CALLOUT_MIN_PX,
  containerRectToBox,
  isTooltipCallout,
  leaderEnd,
  resizeCalloutBox,
} from './calloutHandles';
import { stepHasCallout } from '../../utils/calloutStyle';
import type { StageGeometry } from '../../types/stage';

const BOX = { x: 600, y: 400, w: 100, h: 60 };
const step = (over: Partial<GuidedLearningStep>): GuidedLearningStep => ({
  id: 's',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  text: 'Hi',
  ...over,
});

describe('callout handle maths', () => {
  const container = { w: 1000, h: 800 };
  const plain = { keepAspect: false, fromCentre: false, container };
  const size = (
    h: (typeof CALLOUT_HANDLES)[number],
    at: { x: number; y: number },
    opts = plain
  ) => resizeCalloutBox(BOX, h, at, opts);

  it('offers all eight handles', () => {
    expect([...CALLOUT_HANDLES].sort()).toEqual([
      'e',
      'n',
      'ne',
      'nw',
      's',
      'se',
      'sw',
      'w',
    ]);
  });

  it('keeps the edge opposite each handle fixed', () => {
    expect(size('e', { x: 760, y: 0 })).toEqual({
      x: 600,
      y: 400,
      w: 160,
      h: 60,
    });
    expect(size('w', { x: 550, y: 0 })).toEqual({
      x: 550,
      y: 400,
      w: 150,
      h: 60,
    });
    expect(size('s', { x: 0, y: 500 })).toEqual({
      x: 600,
      y: 400,
      w: 100,
      h: 100,
    });
    expect(size('n', { x: 0, y: 380 })).toEqual({
      x: 600,
      y: 380,
      w: 100,
      h: 80,
    });
    expect(size('se', { x: 720, y: 490 })).toEqual({
      x: 600,
      y: 400,
      w: 120,
      h: 90,
    });
    expect(size('nw', { x: 580, y: 390 })).toEqual({
      x: 580,
      y: 390,
      w: 120,
      h: 70,
    });
    expect(size('ne', { x: 720, y: 390 })).toEqual({
      x: 600,
      y: 390,
      w: 120,
      h: 70,
    });
    expect(size('sw', { x: 580, y: 490 })).toEqual({
      x: 580,
      y: 400,
      w: 120,
      h: 90,
    });
  });

  it('resizes about the centre with Alt', () => {
    const r = size('e', { x: 750, y: 0 }, { ...plain, fromCentre: true });
    // Centre 650: the edge 100px out gives 100px each side.
    expect(r).toEqual({ x: 550, y: 400, w: 200, h: 60 });
  });

  it('keeps the aspect with Shift', () => {
    const side = size('e', { x: 800, y: 0 }, { ...plain, keepAspect: true });
    expect(side.w).toBe(200);
    expect(side.h).toBeCloseTo(120);
    const corner = size(
      'se',
      { x: 650, y: 520 },
      { ...plain, keepAspect: true }
    );
    // The larger of 0.5× and 2× wins.
    expect(corner).toEqual({ x: 600, y: 400, w: 200, h: 120 });
  });

  it('never shrinks below the minimum or leaves the stage', () => {
    const tiny = size('se', { x: 590, y: 390 });
    expect(tiny).toMatchObject({ w: CALLOUT_MIN_PX.w, h: CALLOUT_MIN_PX.h });
    const huge = size('e', { x: 5000, y: 0 });
    expect(huge.w).toBe(container.w);
    expect(huge.x).toBe(0);
    const out = size('e', { x: 1200, y: 0 }, { ...plain, fromCentre: true });
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.x + out.w).toBeLessThanOrEqual(container.w);
  });

  it('keeps both sides above the minimum when Shift holds a wide aspect', () => {
    const wide = { x: 100, y: 100, w: 300, h: 60 };
    const r = resizeCalloutBox(
      wide,
      'e',
      { x: 0, y: 0 },
      {
        ...plain,
        keepAspect: true,
      }
    );
    expect(r.h).toBeGreaterThanOrEqual(CALLOUT_MIN_PX.h);
    expect(r.w / r.h).toBeCloseTo(5);
  });

  it('converts a container rect to an image-% box', () => {
    const g = {
      containerPxToImagePct: (x: number, y: number) => ({
        xPct: x / 10,
        yPct: y / 8,
      }),
    } as unknown as StageGeometry;
    expect(containerRectToBox(g, BOX)).toEqual({
      xPct: 60,
      yPct: 50,
      wPct: 10,
      hPct: 7.5,
    });
  });

  it('covers tooltips and popovers, including overlays, but not banners', () => {
    expect(stepHasCallout(step({}))).toBe(true);
    expect(stepHasCallout(step({ interactionType: 'text-popover' }))).toBe(
      true
    );
    expect(
      stepHasCallout(
        step({ interactionType: 'pan-zoom', showOverlay: 'popover' })
      )
    ).toBe(true);
    expect(
      stepHasCallout(
        step({ interactionType: 'spotlight', showOverlay: 'banner' })
      )
    ).toBe(false);
    expect(stepHasCallout(step({ interactionType: 'question' }))).toBe(false);
    expect(
      isTooltipCallout(
        step({ interactionType: 'spotlight', showOverlay: 'tooltip' })
      )
    ).toBe(true);
    expect(isTooltipCallout(step({ interactionType: 'text-popover' }))).toBe(
      false
    );
  });

  it('puts the anchor dot on the target edge facing the box', () => {
    const target = { x: 100, y: 100, w: 50, h: 50 };
    expect(leaderEnd(BOX, target)).toEqual({ x: 150, y: 150 });
    expect(leaderEnd({ x: 110, y: 300, w: 30, h: 20 }, target)).toEqual({
      x: 125,
      y: 150,
    });
  });
});
