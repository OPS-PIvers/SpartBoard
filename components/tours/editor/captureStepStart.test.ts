import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet, WidgetData } from '@/types';
import { captureStepStart, maxTourSlot } from './captureStepStart';

const widget = (id: string, z: number, extra: Partial<WidgetData> = {}) =>
  ({
    id,
    type: 'clock',
    z,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    xProp: 0.1,
    yProp: 0.2,
    wProp: 0.3,
    hProp: 0.4,
    config: {},
    ...extra,
  }) as unknown as WidgetData;

const set = {
  steps: [{ id: 's', tour: { anchor: 'a', action: 'click', slot: 3 } }],
  tourSetup: { widgets: [], layouts: [{ slot: 1 }] },
} as unknown as GuidedLearningSet;

describe('captureStepStart', () => {
  it('keeps known slots, gives new widgets fresh ones and skips hidden ones', () => {
    const { start, slots } = captureStepStart({
      widgets: [widget('known', 2), widget('new', 1), widget('mine', 3)],
      hidden: new Set(['mine']),
      overrides: new Map([
        ['known', { xProp: 0.5, yProp: 0.5, wProp: 0.1, hProp: 0.1 }],
      ]),
      slots: { 1: 'known' },
      set,
      untitledLabel: 'Made',
      viewport: { w: 1000, h: 800 },
    });
    expect(slots).toEqual({ 1: 'known', 4: 'new' });
    expect(start.layouts).toEqual([
      expect.objectContaining({ slot: 4, xProp: 0.1 }),
      expect.objectContaining({ slot: 1, xProp: 0.5 }),
    ]);
    expect(start.open).toBeUndefined();
  });

  it('counts every slot the tour uses', () => {
    expect(maxTourSlot(set, { 7: 'w' })).toBe(7);
    expect(maxTourSlot(set, {})).toBe(3);
  });
});
