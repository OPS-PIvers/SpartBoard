import { describe, it, expect } from 'vitest';
import { parseTime } from './utils';
import { parseScheduleTime, parseScheduleTimeSeconds } from '../Schedule/utils';

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
