import { describe, expect, it } from 'vitest';
import {
  schoolYearStart,
  zonedDateKey,
  zonedParts,
  zonedTimeToEpoch,
} from './plcHomeTime';

describe('plcHomeTime', () => {
  it('round-trips Chicago wall-clock times across both DST seasons', () => {
    for (const [m, d] of [
      [1, 15],
      [7, 15],
      [11, 2],
    ] as const) {
      const ms = zonedTimeToEpoch(2026, m, d, 15, 15);
      expect(zonedParts(ms)).toMatchObject({
        year: 2026,
        month: m,
        day: d,
        hour: 15,
        minute: 15,
      });
    }
    // CST is UTC-6, CDT is UTC-5.
    expect(new Date(zonedTimeToEpoch(2026, 1, 15, 12)).getUTCHours()).toBe(18);
    expect(new Date(zonedTimeToEpoch(2026, 7, 15, 12)).getUTCHours()).toBe(17);
  });

  it('starts the school year on Aug 1 in Chicago', () => {
    const fall = zonedTimeToEpoch(2026, 10, 1);
    const spring = zonedTimeToEpoch(2027, 3, 1);
    expect(zonedDateKey(schoolYearStart(fall))).toBe('2026-08-01');
    expect(zonedDateKey(schoolYearStart(spring))).toBe('2026-08-01');
    expect(
      zonedDateKey(schoolYearStart(zonedTimeToEpoch(2026, 7, 31, 23)))
    ).toBe('2025-08-01');
  });
});
