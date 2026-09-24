// PLC meeting cadence: parse, next occurrence (with move/skip overrides) and meeting-day state.

import type { PlcMeetingCadence, PlcMeetingFrequency } from '@/types';
import {
  formatDateKey,
  parseDateKey,
  zonedDateKey,
  zonedTimeToEpoch,
} from '@/utils/plcHomeTime';

const DAY_MS = 86_400_000;
/** A meeting still counts as "next" (and today's hero) until this long after its start. */
export const MEETING_GRACE_MS = 2 * 60 * 60 * 1000;
/** Overrides for occurrences older than this are dropped on each write. */
const OVERRIDE_RETENTION_DAYS = 30;
const FREQUENCIES: readonly PlcMeetingFrequency[] = [
  'weekly',
  'biweekly',
  'monthlyNthWeekday',
];

export interface MeetingOccurrence {
  /** The scheduled date before any move; the override key. */
  originalDate: string;
  /** The date it happens on, after a move. */
  date: string;
  start: number;
  moved: boolean;
}

function parseTime(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function parseMeetingCadence(raw: unknown): PlcMeetingCadence | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!FREQUENCIES.includes(r.frequency as PlcMeetingFrequency)) return null;
  if (typeof r.weekday !== 'number' || r.weekday < 0 || r.weekday > 6) {
    return null;
  }
  if (typeof r.time !== 'string' || !parseTime(r.time)) return null;
  if (typeof r.anchorDate !== 'string' || !parseDateKey(r.anchorDate)) {
    return null;
  }
  const cadence: PlcMeetingCadence = {
    frequency: r.frequency as PlcMeetingFrequency,
    weekday: Math.floor(r.weekday),
    time: r.time,
    anchorDate: r.anchorDate,
  };
  if (cadence.frequency === 'monthlyNthWeekday') {
    const nth = typeof r.nth === 'number' ? r.nth : 1;
    cadence.nth = [1, 2, 3, 4, -1].includes(nth) ? nth : 1;
  }
  if (typeof r.defaultAgenda === 'string' && r.defaultAgenda.trim()) {
    cadence.defaultAgenda = r.defaultAgenda;
  }
  if (r.overrides && typeof r.overrides === 'object') {
    const overrides: NonNullable<PlcMeetingCadence['overrides']> = {};
    for (const [key, value] of Object.entries(
      r.overrides as Record<string, unknown>
    )) {
      if (!parseDateKey(key) || !value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      if (v.skipped === true) overrides[key] = { skipped: true };
      else if (typeof v.movedTo === 'string' && parseDateKey(v.movedTo)) {
        overrides[key] = { movedTo: v.movedTo };
      }
    }
    if (Object.keys(overrides).length > 0) cadence.overrides = overrides;
  }
  return cadence;
}

/** Days since 1970-01-01 for a calendar date (timezone-free). */
function dayNumber(key: string): number {
  const p = parseDateKey(key);
  if (!p) return 0;
  return Math.round(Date.UTC(p.year, p.month - 1, p.day) / DAY_MS);
}

function keyFromDayNumber(n: number): string {
  const d = new Date(n * DAY_MS);
  return formatDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function weekdayOf(n: number): number {
  return new Date(n * DAY_MS).getUTCDay();
}

/** The nth (or last, -1) given weekday of a month, as a day number. */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  nth: number
): number {
  if (nth === -1) {
    const last = Math.round(Date.UTC(year, month, 0) / DAY_MS);
    return last - ((weekdayOf(last) - weekday + 7) % 7);
  }
  const first = Math.round(Date.UTC(year, month - 1, 1) / DAY_MS);
  return first + ((weekday - weekdayOf(first) + 7) % 7) + (nth - 1) * 7;
}

/** Scheduled (pre-override) dates within [fromDay, toDay], never before the anchor. */
export function scheduledDates(
  cadence: PlcMeetingCadence,
  fromDay: number,
  toDay: number
): string[] {
  const anchor = dayNumber(cadence.anchorDate);
  const from = Math.max(fromDay, anchor);
  const out: string[] = [];
  if (cadence.frequency === 'monthlyNthWeekday') {
    const start = new Date(from * DAY_MS);
    let year = start.getUTCFullYear();
    let month = start.getUTCMonth() + 1;
    for (let i = 0; i < 24; i++) {
      const day = nthWeekdayOfMonth(
        year,
        month,
        cadence.weekday,
        cadence.nth ?? 1
      );
      if (day > toDay) break;
      if (day >= from) out.push(keyFromDayNumber(day));
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    return out;
  }
  const period = cadence.frequency === 'biweekly' ? 14 : 7;
  const first = anchor + ((cadence.weekday - weekdayOf(anchor) + 7) % 7);
  const steps = Math.max(0, Math.ceil((from - first) / period));
  for (let day = first + steps * period; day <= toDay; day += period) {
    out.push(keyFromDayNumber(day));
  }
  return out;
}

function startOf(dateKey: string, time: string): number {
  const p = parseDateKey(dateKey);
  const t = parseTime(time);
  if (!p || !t) return 0;
  return zonedTimeToEpoch(p.year, p.month, p.day, t.hour, t.minute);
}

/** The first meeting at or after `now` minus the grace window, overrides applied. */
export function nextMeetingOccurrence(
  cadence: PlcMeetingCadence,
  now: number
): MeetingOccurrence | null {
  const today = dayNumber(zonedDateKey(now));
  // Look back far enough to catch an occurrence moved forward into the window.
  const dates = scheduledDates(cadence, today - 62, today + 400);
  const floor = now - MEETING_GRACE_MS;
  let best: MeetingOccurrence | null = null;
  for (const originalDate of dates) {
    const override = cadence.overrides?.[originalDate];
    if (override?.skipped) continue;
    const date = override?.movedTo ?? originalDate;
    const start = startOf(date, cadence.time);
    if (start < floor) continue;
    if (!best || start < best.start) {
      best = { originalDate, date, start, moved: date !== originalDate };
    }
  }
  return best;
}

function prunedOverrides(
  overrides: PlcMeetingCadence['overrides'],
  now: number
): NonNullable<PlcMeetingCadence['overrides']> {
  const cutoff = dayNumber(zonedDateKey(now)) - OVERRIDE_RETENTION_DAYS;
  const out: NonNullable<PlcMeetingCadence['overrides']> = {};
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (dayNumber(key) >= cutoff) out[key] = value;
  }
  return out;
}

/** The cadence ready to write: old overrides pruned, empty optionals dropped. */
export function cadenceForWrite(
  cadence: PlcMeetingCadence,
  now: number
): PlcMeetingCadence {
  const { overrides, defaultAgenda, nth, ...rest } = cadence;
  const kept = prunedOverrides(overrides, now);
  return {
    ...rest,
    ...(rest.frequency === 'monthlyNthWeekday' ? { nth: nth ?? 1 } : {}),
    ...(defaultAgenda?.trim() ? { defaultAgenda } : {}),
    ...(Object.keys(kept).length > 0 ? { overrides: kept } : {}),
  };
}

export function skipOccurrence(
  cadence: PlcMeetingCadence,
  occurrence: MeetingOccurrence
): PlcMeetingCadence {
  return {
    ...cadence,
    overrides: {
      ...cadence.overrides,
      [occurrence.originalDate]: { skipped: true },
    },
  };
}

export function moveOccurrence(
  cadence: PlcMeetingCadence,
  occurrence: MeetingOccurrence,
  toDate: string
): PlcMeetingCadence {
  const overrides = { ...cadence.overrides };
  if (toDate === occurrence.originalDate)
    delete overrides[occurrence.originalDate];
  else overrides[occurrence.originalDate] = { movedTo: toDate };
  return { ...cadence, overrides };
}

/** D26: today is meeting day until today's meeting is completed or its grace window ends. */
export function isMeetingDayActive(params: {
  occurrence: MeetingOccurrence | null;
  completedMeetingDates: readonly string[];
  now: number;
}): boolean {
  const { occurrence, completedMeetingDates, now } = params;
  if (!occurrence) return false;
  if (occurrence.date !== zonedDateKey(now)) return false;
  if (now > occurrence.start + MEETING_GRACE_MS) return false;
  return !completedMeetingDates.includes(occurrence.date);
}

type Translate = (key: string, options: Record<string, unknown>) => string;

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const NTH_NAMES: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  [-1]: 'last',
};

export function weekdayName(weekday: number, locale?: string): string {
  try {
    // Jan 4 2026 was a Sunday.
    return new Date(Date.UTC(2026, 0, 4 + weekday)).toLocaleDateString(locale, {
      weekday: 'long',
      timeZone: 'UTC',
    });
  } catch {
    return WEEKDAY_NAMES[weekday] ?? '';
  }
}

export function formatCadenceTime(time: string, locale?: string): string {
  const t = parseTime(time);
  if (!t) return time;
  try {
    return new Date(Date.UTC(2000, 0, 1, t.hour, t.minute)).toLocaleTimeString(
      locale,
      { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }
    );
  } catch {
    return time;
  }
}

/** "Every Thursday at 3:15 PM", "The last Friday of each month at 7:30 AM". */
export function describeMeetingCadence(
  cadence: PlcMeetingCadence,
  t: Translate,
  locale?: string
): string {
  const day = weekdayName(cadence.weekday, locale);
  const time = formatCadenceTime(cadence.time, locale);
  if (cadence.frequency === 'weekly') {
    return t('plcDashboard.meetingCadence.summary.weekly', {
      day,
      time,
      defaultValue: 'Every {{day}} at {{time}}',
    });
  }
  if (cadence.frequency === 'biweekly') {
    return t('plcDashboard.meetingCadence.summary.biweekly', {
      day,
      time,
      defaultValue: 'Every other {{day}} at {{time}}',
    });
  }
  const nth = NTH_NAMES[cadence.nth ?? 1] ?? 'first';
  return t(`plcDashboard.meetingCadence.summary.monthly.${nth}`, {
    day,
    time,
    defaultValue: `The ${nth} {{day}} of each month at {{time}}`,
  });
}

/** Whole Chicago calendar days from `now` to the occurrence (0 = today). */
export function daysUntilOccurrence(
  occurrence: MeetingOccurrence,
  now: number
): number {
  return dayNumber(occurrence.date) - dayNumber(zonedDateKey(now));
}

/** "Thu, Sep 24" for a 'YYYY-MM-DD' key, independent of the viewer's time zone. */
export function formatDateKeyShort(key: string, locale?: string): string {
  const p = parseDateKey(key);
  if (!p) return key;
  try {
    return new Date(Date.UTC(p.year, p.month - 1, p.day)).toLocaleDateString(
      locale,
      { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }
    );
  } catch {
    return key;
  }
}
