import { describe, expect, it } from 'vitest';
import {
  dayEnd,
  dayStart,
  latestEnd,
  lastPickableDay,
  resolveSubShareDates,
  toDateTimeInput,
} from './subShareDates';

const HOUR = 60 * 60 * 1000;
// Mon Dec 1 2026, 9:00 AM local.
const NOW = new Date(2026, 11, 1, 9, 0).getTime();

describe('sub share dates', () => {
  it('ends 48 hours after the last day by default', () => {
    expect(latestEnd('2026-12-01', NOW)).toBe(
      new Date(2026, 11, 3, 23, 59).getTime()
    );
    expect(latestEnd('2026-12-04', NOW)).toBe(dayEnd('2026-12-04') + 48 * HOUR);
  });

  it('never runs past the 14-day cap', () => {
    const cap = NOW + 14 * 24 * HOUR;
    expect(latestEnd('2026-12-14', NOW)).toBe(cap);
    expect(lastPickableDay(NOW)).toBe('2026-12-14');
  });

  it('opens at the start of the first day and keeps the last day', () => {
    const r = resolveSubShareDates(
      '2026-12-02',
      '2026-12-04',
      toDateTimeInput(latestEnd('2026-12-04', NOW)),
      NOW
    );
    expect(r).toEqual({
      ok: true,
      availableFrom: dayStart('2026-12-02'),
      availableThrough: dayEnd('2026-12-04'),
      expiresAt: latestEnd('2026-12-04', NOW),
    });
  });

  it('turns down a last day before the first', () => {
    expect(
      resolveSubShareDates('2026-12-04', '2026-12-02', '2026-12-05T12:00', NOW)
    ).toEqual({ ok: false, error: 'lastBeforeFirst' });
  });

  it('turns down an end past 48 hours after the last day', () => {
    expect(
      resolveSubShareDates('2026-12-02', '2026-12-02', '2026-12-05T08:00', NOW)
    ).toEqual({ ok: false, error: 'endTooLate' });
  });

  it('keeps an end the share already has, such as after Add a week', () => {
    const saved = new Date(2026, 11, 8, 9, 0).getTime();
    expect(
      resolveSubShareDates(
        '2026-12-01',
        '2026-12-01',
        toDateTimeInput(saved),
        NOW,
        saved
      ).ok
    ).toBe(true);
  });

  it('turns down an end in the past or before the share opens', () => {
    expect(
      resolveSubShareDates('2026-12-01', '2026-12-01', '2026-12-01T08:00', NOW)
    ).toEqual({ ok: false, error: 'endPast' });
    expect(
      resolveSubShareDates('2026-12-05', '2026-12-05', '2026-12-04T08:00', NOW)
    ).toEqual({ ok: false, error: 'endBeforeOpen' });
  });

  it('turns down a missing day', () => {
    expect(resolveSubShareDates('', '', '2026-12-02T08:00', NOW)).toEqual({
      ok: false,
      error: 'badDay',
    });
  });
});
