import { describe, expect, it } from 'vitest';
import type { FieldCtx } from '@/components/settings/schema/types';
import schema from './settings.schema';

const context: FieldCtx = {
  config: { isAuto: false, temp: 70 },
  widget: {
    id: 'weather-test',
    type: 'weather',
    x: 0,
    y: 0,
    w: 300,
    h: 300,
    z: 1,
    flipped: false,
    config: { isAuto: false, temp: 70 },
  },
  isAdmin: true,
  canAccessFeature: () => true,
  t: (key) => (key === 'widgets.weather.manualMode' ? 'Manual Mode' : key),
};

describe('Weather settings schema', () => {
  it('uses a searchable slider for manual temperature', () => {
    const temperature = schema.groups[0]?.fields.find(
      (field) => field.key === 'temp'
    );
    expect(temperature?.type).toBe('slider');
    expect(temperature?.visibleWhen?.(context)).toBe(true);
  });

  it('writes the manual location label atomically with temperature', () => {
    const temperature = schema.groups[0]?.fields.find(
      (field) => field.key === 'temp'
    );
    expect(temperature?.toPatch?.(68, context)).toEqual({
      temp: 68,
      locationName: 'Manual Mode',
    });
  });
});
