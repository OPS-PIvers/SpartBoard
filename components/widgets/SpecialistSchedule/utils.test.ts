import { describe, it, expect } from 'vitest';
import { parseTime, resolveBuildingConfig } from './utils';
import {
  parseScheduleTime,
  parseScheduleTimeSeconds,
} from '@/components/widgets/Schedule/utils';

describe('time parsers reject partial input', () => {
  it.each([':30', '12:', ':', '1:2', '99:99'])('parseTime(%s) is -1', (t) => {
    expect(parseTime(t)).toBe(-1);
  });
  it.each([':30', '12:', ':'])('Schedule parsers reject %s', (t) => {
    expect(parseScheduleTime(t)).toBe(-1);
    expect(parseScheduleTimeSeconds(t)).toBe(-1);
  });
  it('still parses valid times', () => {
    expect(parseTime('9:30')).toBe(570);
    expect(parseScheduleTime('09:30')).toBe(570);
  });
});

describe('resolveBuildingConfig', () => {
  const schumann = { cycleLength: 4, specialistOptions: ['🎵 Music'] };
  const config = (key: string) =>
    ({ buildingDefaults: { [key]: schumann } }) as never;

  it.each([
    ['schumann', 'schumann-elementary'],
    ['schumann-elementary', 'schumann'],
    ['schumann', 'schumann'],
  ])('finds a %s widget in a record keyed %s', (buildingId, key) => {
    expect(resolveBuildingConfig(config(key), buildingId)).toBe(schumann);
  });

  it('uses Schumann when the widget has no building', () => {
    expect(resolveBuildingConfig(config('schumann'), undefined)).toBe(schumann);
  });

  it('returns undefined for a building with no saved config', () => {
    expect(resolveBuildingConfig(config('schumann'), 'high')).toBeUndefined();
    expect(resolveBuildingConfig(undefined, 'schumann')).toBeUndefined();
  });
});
