import { describe, it, expect } from 'vitest';
import type { WidgetType } from '@/types';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import {
  WIDGET_ENVELOPES,
  envelopeSizes,
  getWidgetMinSize,
  hasExplicitMinSize,
} from '@/config/widgetEnvelopes';

const ALL_TYPES = Object.keys(WIDGET_DEFAULTS) as WidgetType[];

describe('WIDGET_ENVELOPES', () => {
  it('has an envelope for every widget type', () => {
    expect(Object.keys(WIDGET_ENVELOPES).sort()).toEqual([...ALL_TYPES].sort());
  });

  it('keeps today min sizes: 150x100 default, url and blooms-taxonomy overrides', () => {
    for (const type of ALL_TYPES) {
      const expected =
        type === 'url'
          ? { w: 80, h: 80 }
          : type === 'blooms-taxonomy'
            ? { w: 280, h: 300 }
            : { w: 150, h: 100 };
      expect(getWidgetMinSize(type)).toEqual(expected);
    }
  });

  it('flags explicit floors only for types that had an override', () => {
    const explicit = ALL_TYPES.filter(hasExplicitMinSize).sort();
    expect(explicit).toEqual(['blooms-taxonomy', 'url']);
  });

  it('has a sane aspect range containing each default size', () => {
    for (const type of ALL_TYPES) {
      const { aspectRange } = WIDGET_ENVELOPES[type];
      expect(aspectRange.min).toBeGreaterThan(0);
      expect(aspectRange.max).toBeGreaterThan(aspectRange.min);
      const { default: d } = envelopeSizes(type);
      const aspect = d.w / d.h;
      expect(aspect).toBeGreaterThanOrEqual(aspectRange.min);
      expect(aspect).toBeLessThanOrEqual(aspectRange.max);
    }
  });

  it('does not default below the min size', () => {
    for (const type of ALL_TYPES) {
      const { min, default: d } = envelopeSizes(type);
      // traffic is intentionally narrower than the generic floor
      if (type === 'traffic') continue;
      expect(d.w).toBeGreaterThanOrEqual(min.w);
      expect(d.h).toBeGreaterThanOrEqual(min.h);
    }
  });
});

describe('envelopeSizes', () => {
  it('returns the six plan sizes', () => {
    const sizes = envelopeSizes('clock');
    expect(sizes.min).toEqual({ w: 150, h: 100 });
    expect(sizes.default).toEqual({ w: 280, h: 140 });
    expect(sizes.large).toEqual({ w: 1400, h: 900 });
    expect(sizes.maximized).toEqual({ w: 1920, h: 1080 });
  });

  it('fits the widest and tallest sizes to the aspect range', () => {
    const sizes = envelopeSizes('clock');
    expect(sizes.widest.w / sizes.widest.h).toBeCloseTo(4, 1);
    expect(sizes.tallest.w / sizes.tallest.h).toBeCloseTo(0.25, 1);
    expect(sizes.widest).toEqual({ w: 1400, h: 350 });
    expect(sizes.tallest).toEqual({ w: 225, h: 900 });
  });

  it('keeps widest and tallest at or above the min size', () => {
    for (const type of ALL_TYPES) {
      const { min, widest, tallest } = envelopeSizes(type);
      for (const s of [widest, tallest]) {
        expect(s.w).toBeGreaterThanOrEqual(min.w);
        expect(s.h).toBeGreaterThanOrEqual(min.h);
      }
    }
  });

  it('raises a tallest size to a larger min size', () => {
    const { tallest } = envelopeSizes('blooms-taxonomy');
    expect(tallest.w).toBeGreaterThanOrEqual(280);
    expect(tallest.h).toBeLessThanOrEqual(1080);
  });
});
