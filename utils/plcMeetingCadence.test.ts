import { describe, expect, it } from 'vitest';
import type { PlcMeetingCadence } from '@/types';
import { zonedDateKey, zonedTimeToEpoch } from './plcHomeTime';
import {
  cadenceForWrite,
  isMeetingDayActive,
  moveOccurrence,
  nextMeetingOccurrence,
  parseMeetingCadence,
  scheduledDates,
  skipOccurrence,
} from './plcMeetingCadence';

const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  zonedTimeToEpoch(y, m, d, h, min);
const DAY = 86_400_000;
const dayNum = (y: number, m: number, d: number) =>
  Math.round(Date.UTC(y, m - 1, d) / DAY);

function must<T>(value: T | null): T {
  if (value === null) throw new Error('expected an occurrence');
  return value;
}

const weeklyThu: PlcMeetingCadence = {
  frequency: 'weekly',
  weekday: 4,
  time: '15:15',
  anchorDate: '2026-09-03',
};

describe('scheduledDates', () => {
  it('keeps biweekly parity from the anchor', () => {
    const cadence = { ...weeklyThu, frequency: 'biweekly' as const };
    expect(
      scheduledDates(cadence, dayNum(2026, 9, 20), dayNum(2026, 10, 31))
    ).toEqual(['2026-10-01', '2026-10-15', '2026-10-29']);
  });

  it('handles the nth and the last weekday across month edges', () => {
    const second: PlcMeetingCadence = {
      frequency: 'monthlyNthWeekday',
      weekday: 2,
      nth: 2,
      time: '07:30',
      anchorDate: '2026-01-01',
    };
    expect(
      scheduledDates(second, dayNum(2026, 1, 1), dayNum(2026, 3, 31))
    ).toEqual(['2026-01-13', '2026-02-10', '2026-03-10']);
    const last = { ...second, nth: -1, weekday: 5 };
    expect(
      scheduledDates(last, dayNum(2026, 1, 1), dayNum(2026, 3, 31))
    ).toEqual(['2026-01-30', '2026-02-27', '2026-03-27']);
  });

  it('never schedules before the anchor', () => {
    expect(
      scheduledDates(weeklyThu, dayNum(2026, 8, 1), dayNum(2026, 9, 12))
    ).toEqual(['2026-09-03', '2026-09-10']);
  });
});

describe('nextMeetingOccurrence', () => {
  it('returns today until two hours after the start, then the next one', () => {
    const during = nextMeetingOccurrence(weeklyThu, at(2026, 9, 24, 16));
    expect(during?.date).toBe('2026-09-24');
    expect(new Date(during?.start ?? 0).toISOString()).toBe(
      '2026-09-24T20:15:00.000Z'
    );
    expect(nextMeetingOccurrence(weeklyThu, at(2026, 9, 24, 18))?.date).toBe(
      '2026-10-01'
    );
  });

  it('keeps the wall-clock time across the DST change', () => {
    const next = nextMeetingOccurrence(weeklyThu, at(2026, 11, 3));
    expect(next?.date).toBe('2026-11-05');
    expect(new Date(next?.start ?? 0).getUTCHours()).toBe(21);
  });

  it('applies skip and move chains', () => {
    const now = at(2026, 9, 21);
    const first = must(nextMeetingOccurrence(weeklyThu, now));
    expect(first.date).toBe('2026-09-24');
    const skipped = skipOccurrence(weeklyThu, first);
    const second = must(nextMeetingOccurrence(skipped, now));
    expect(second.date).toBe('2026-10-01');
    const moved = moveOccurrence(skipped, second, '2026-09-29');
    const third = must(nextMeetingOccurrence(moved, now));
    expect(third).toMatchObject({
      originalDate: '2026-10-01',
      date: '2026-09-29',
      moved: true,
    });
    const back = moveOccurrence(moved, third, '2026-10-01');
    expect(back.overrides?.['2026-10-01']).toBeUndefined();
  });
});

describe('isMeetingDayActive (D26)', () => {
  const occurrence = nextMeetingOccurrence(weeklyThu, at(2026, 9, 24, 8));
  it('is on during meeting day until a completed meeting or the grace window ends', () => {
    expect(
      isMeetingDayActive({
        occurrence,
        completedMeetingDates: [],
        now: at(2026, 9, 24, 8),
      })
    ).toBe(true);
    expect(
      isMeetingDayActive({
        occurrence,
        completedMeetingDates: ['2026-09-24'],
        now: at(2026, 9, 24, 8),
      })
    ).toBe(false);
    expect(
      isMeetingDayActive({
        occurrence,
        completedMeetingDates: [],
        now: at(2026, 9, 24, 17, 30),
      })
    ).toBe(false);
    expect(
      isMeetingDayActive({
        occurrence,
        completedMeetingDates: [],
        now: at(2026, 9, 23, 8),
      })
    ).toBe(false);
  });
});

describe('parse and write', () => {
  it('rejects malformed cadences and bad overrides', () => {
    expect(parseMeetingCadence({ ...weeklyThu, time: '3pm' })).toBeNull();
    expect(parseMeetingCadence({ ...weeklyThu, weekday: 9 })).toBeNull();
    expect(
      parseMeetingCadence({
        ...weeklyThu,
        overrides: { '2026-09-24': { skipped: true }, nope: { skipped: true } },
      })?.overrides
    ).toEqual({ '2026-09-24': { skipped: true } });
  });

  it('prunes overrides older than 30 days on write', () => {
    const now = at(2026, 11, 15);
    const written = cadenceForWrite(
      {
        ...weeklyThu,
        defaultAgenda: '  ',
        overrides: {
          '2026-09-24': { skipped: true },
          '2026-11-05': { movedTo: '2026-11-06' },
        },
      },
      now
    );
    expect(written.overrides).toEqual({
      '2026-11-05': { movedTo: '2026-11-06' },
    });
    expect('defaultAgenda' in written).toBe(false);
    expect(zonedDateKey(now)).toBe('2026-11-15');
  });
});
