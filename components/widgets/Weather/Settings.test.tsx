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

  it('treats an unset isAuto as manual, matching the widget default', () => {
    const mode = schema.groups[0]?.fields.find(
      (field) => field.key === 'isAuto'
    );
    const unset: FieldCtx = { ...context, config: { temp: 70 } };
    expect(mode?.readValue?.(unset)).toBe('manual');
    expect(
      schema.groups[0]?.fields
        .find((field) => field.key === 'temp')
        ?.visibleWhen?.(unset)
    ).toBe(true);
  });

  it('lets secondary text color inherit the font color while unset', () => {
    const secondary = schema.groups
      .flatMap((group) => group.fields)
      .find((field) => field.key === 'secondaryColor');
    if (secondary?.type !== 'accentColor') {
      throw new Error('secondaryColor must be an accent color field');
    }
    expect(
      secondary.fallback?.({ ...context, config: { fontColor: '#ad2122' } })
    ).toBe('#ad2122');
    expect(secondary.fallback?.({ ...context, config: {} })).toBe('#334155');
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
