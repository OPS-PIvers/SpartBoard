import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import {
  hasEditableCallout,
  isTooltipCallout,
  leaderEnd,
  resizeCalloutSide,
  scaleCalloutCorner,
  withCalloutSize,
} from './calloutHandles';

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
  it('grows an auto-placed callout about its centre from a side handle', () => {
    const edit = resizeCalloutSide(BOX, 'e', 740, 720, false);
    // 2 × (740 − 650) = 180px of a 720px stage.
    expect(edit.widthPct).toBeCloseTo(25);
    expect(edit.centre).toBeNull();
  });

  it('keeps a pinned callout’s opposite edge fixed', () => {
    const edit = resizeCalloutSide(BOX, 'w', 560, 720, true);
    expect(edit.widthPct).toBeCloseTo((140 / 720) * 100, 1);
    expect(edit.centre?.x).toBeCloseTo(700 - 70, 0);
    expect(edit.centre?.y).toBe(430);
  });

  it('clamps width to 10–95% of the stage', () => {
    expect(resizeCalloutSide(BOX, 'e', 601, 720, true).widthPct).toBe(10);
    expect(resizeCalloutSide(BOX, 'e', 5000, 720, false).widthPct).toBe(95);
  });

  it('scales from the opposite corner and carries a set width with it', () => {
    const edit = scaleCalloutCorner(BOX, 'se', { x: 750, y: 490 }, 1, 20, true);
    expect(edit.scale).toBeCloseTo(1.5);
    expect(edit.widthPct).toBeCloseTo(30);
    // Anchored at (600, 400): the centre (650, 430) moves out by 1.5×.
    expect(edit.centre).toEqual({ x: 675, y: 445 });
  });

  it('leaves an auto width auto and clamps scale to 0.75–2', () => {
    const big = scaleCalloutCorner(
      BOX,
      'nw',
      { x: 0, y: 0 },
      1,
      undefined,
      false
    );
    expect(big.scale).toBe(2);
    expect(big.widthPct).toBeUndefined();
    expect(big.centre).toBeNull();
    const small = scaleCalloutCorner(
      BOX,
      'ne',
      { x: 610, y: 455 },
      1,
      undefined,
      false
    );
    expect(small.scale).toBe(0.75);
  });

  it('drops the scale field when it returns to 1', () => {
    const scaled = withCalloutSize(step({}), { scale: 1.25, widthPct: 40 });
    expect(scaled).toMatchObject({ calloutScale: 1.25, calloutWidthPct: 40 });
    expect(withCalloutSize(scaled, { scale: 1 })).not.toHaveProperty(
      'calloutScale'
    );
  });

  it('covers tooltips and popovers, including overlays, but not banners', () => {
    expect(hasEditableCallout(step({}))).toBe(true);
    expect(hasEditableCallout(step({ interactionType: 'text-popover' }))).toBe(
      true
    );
    expect(
      hasEditableCallout(
        step({ interactionType: 'pan-zoom', showOverlay: 'popover' })
      )
    ).toBe(true);
    expect(
      hasEditableCallout(
        step({ interactionType: 'spotlight', showOverlay: 'banner' })
      )
    ).toBe(false);
    expect(hasEditableCallout(step({ interactionType: 'question' }))).toBe(
      false
    );
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
