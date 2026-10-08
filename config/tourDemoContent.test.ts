import { describe, expect, it } from 'vitest';
import { tourDemoConfig, tourDemoScheduleItems } from './tourDemoContent';

const at = (h: number, m: number) => new Date(2026, 9, 8, h, m);
const toMin = (t = '') => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

describe('tourDemoScheduleItems', () => {
  it.each([
    [0, 20],
    [8, 5],
    [11, 38],
    [15, 59],
    [22, 45],
    [23, 30],
  ])('has a period in session at %i:%i', (h, m) => {
    const now = h * 60 + m;
    const items = tourDemoScheduleItems(at(h, m));
    const active = items.find((i) => toMin(i.endTime) > now);
    expect(toMin(active?.startTime)).toBeLessThanOrEqual(now);
    expect(active).toBeDefined();
  });

  it('keeps every period a valid same-day time with an end after its start', () => {
    for (let h = 0; h < 24; h++) {
      for (const i of tourDemoScheduleItems(at(h, 30))) {
        expect(i.startTime).toMatch(/^\d{2}:\d{2}$/);
        expect(toMin(i.endTime)).toBeGreaterThan(toMin(i.startTime));
      }
    }
  });
});

describe('tourDemoConfig', () => {
  it('only seeds Schedule', () => {
    expect(tourDemoConfig('schedule', at(10, 0))).toHaveProperty('items');
    expect(tourDemoConfig('clock')).toBeUndefined();
  });
});
