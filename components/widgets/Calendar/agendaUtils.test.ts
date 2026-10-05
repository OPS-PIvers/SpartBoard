import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '@/types';
import { formatDayHeader, groupAgendaDays, isPastEvent } from './agendaUtils';

const today = '2026-10-05';
const at = (h: number, m = 0) => h * 3600 + m * 60;

describe('formatDayHeader', () => {
  it('names the weekday and an ordinal date', () => {
    expect(formatDayHeader('2026-10-05')).toEqual({
      weekday: 'Monday',
      rest: 'October 5th',
    });
    expect(formatDayHeader('2026-10-01').rest).toBe('October 1st');
    expect(formatDayHeader('2026-10-12').rest).toBe('October 12th');
    expect(formatDayHeader('2026-10-22').rest).toBe('October 22nd');
  });

  it('passes a typed day label through', () => {
    expect(formatDayHeader('Friday')).toEqual({ weekday: 'Friday', rest: '' });
  });
});

describe('isPastEvent', () => {
  const ev = (e: Partial<CalendarEvent>): CalendarEvent => ({
    date: today,
    title: 'x',
    ...e,
  });

  it('uses the end time when there is one', () => {
    const plc = ev({ time: '10:30 AM', endTime: '11:20 AM' });
    expect(isPastEvent(plc, today, at(10, 40))).toBe(false);
    expect(isPastEvent(plc, today, at(11, 20))).toBe(true);
  });

  it('falls back to the start time', () => {
    expect(isPastEvent(ev({ time: '9:15' }), today, at(9, 16))).toBe(true);
  });

  it('never ends all-day or other-day events', () => {
    expect(isPastEvent(ev({}), today, at(23))).toBe(false);
    expect(
      isPastEvent(ev({ date: '2026-10-04', time: '8:00 AM' }), today, at(12))
    ).toBe(false);
  });
});

describe('groupAgendaDays', () => {
  const events: CalendarEvent[] = [
    { date: today, time: '7:30 AM', endTime: '8:00 AM', title: 'Early' },
    { date: today, title: 'All day thing' },
    { date: today, time: '1:00 PM', title: 'Later' },
    { date: '2026-10-06', time: '8:00 AM', title: 'Tomorrow' },
  ];

  it('drops ended events when hiding', () => {
    const days = groupAgendaDays(events, today, at(10), 'hide');
    expect(days.map(([d, list]) => [d, list.map((e) => e.title)])).toEqual([
      [today, ['All day thing', 'Later']],
      ['2026-10-06', ['Tomorrow']],
    ]);
  });

  it('puts ended events first when scrolling', () => {
    const [[, list]] = groupAgendaDays(events, today, at(10), 'scroll');
    expect(list.map((e) => e.title)).toEqual([
      'Early',
      'All day thing',
      'Later',
    ]);
  });

  it('always includes today', () => {
    const days = groupAgendaDays(
      [{ date: '2026-10-06', title: 'Tomorrow' }],
      today,
      at(10),
      'hide'
    );
    expect(days[0]).toEqual([today, []]);
  });
});
