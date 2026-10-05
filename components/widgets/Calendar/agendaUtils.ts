import type { CalendarEvent } from '@/types';

const ordinal = (n: number) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** "Monday" and "October 5th" for an ISO date, or the raw label when it isn't one. */
export const formatDayHeader = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { weekday: date, rest: '' };
  const d = new Date(date + 'T00:00:00');
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
    rest: `${d.toLocaleDateString('en-US', { month: 'long' })} ${ordinal(d.getDate())}`,
  };
};

/** Seconds since midnight for "14:30" or "2:30 PM", or -1. */
export const toSeconds = (t: string | undefined): number => {
  if (!t || !t.includes(':')) return -1;
  const lower = t.toLowerCase();
  const [hs, ms] = lower.split(':');
  let h = parseInt(hs, 10);
  const m = parseInt(ms.replace(/[^0-9]/g, ''), 10);
  if (lower.includes('pm') && h < 12) h += 12;
  if (lower.includes('am') && h === 12) h = 0;
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 3600 + m * 60;
};

export const formatTime = (t: string | undefined) => {
  const s = toSeconds(t);
  if (s < 0) return t ?? '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** True once a timed event of today has ended (or started, when it has no end time). */
export const isPastEvent = (
  event: CalendarEvent,
  today: string,
  nowSeconds: number
) => {
  if (event.date !== today || !event.time) return false;
  const end = toSeconds(event.endTime ?? event.time);
  return end >= 0 && end <= nowSeconds;
};

/** Groups events by day; today always comes first, ordered past, all-day, then upcoming. */
export const groupAgendaDays = (
  events: CalendarEvent[],
  today: string,
  nowSeconds: number,
  pastEvents: 'hide' | 'scroll'
): [string, CalendarEvent[]][] => {
  const isPast = (e: CalendarEvent) => isPastEvent(e, today, nowSeconds);
  const map = new Map<string, CalendarEvent[]>([[today, []]]);
  for (const e of events) {
    if (pastEvents === 'hide' && isPast(e)) continue;
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  const todays = map.get(today) ?? [];
  map.set(today, [
    ...todays.filter(isPast),
    ...todays.filter((e) => !e.time),
    ...todays.filter((e) => e.time && !isPast(e)),
  ]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
};
