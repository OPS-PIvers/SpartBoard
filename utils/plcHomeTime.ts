// Wall-clock helpers pinned to the district's time zone (America/Chicago) for PLC Home.

export const PLC_HOME_TIME_ZONE = 'America/Chicago';

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: number; // 0 = Sunday
  hour: number;
  minute: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let formatter: Intl.DateTimeFormat | null = null;
function getFormatter(): Intl.DateTimeFormat {
  formatter ??= new Intl.DateTimeFormat('en-US', {
    timeZone: PLC_HOME_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  return formatter;
}

/** Calendar parts of an instant as seen on a Chicago wall clock. */
export function zonedParts(ms: number): ZonedParts {
  const out: Record<string, string> = {};
  for (const part of getFormatter().formatToParts(new Date(ms))) {
    out[part.type] = part.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    weekday: WEEKDAYS.indexOf(out.weekday ?? 'Sun'),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
  };
}

/** The instant a Chicago wall-clock time names (DST-aware; gaps resolve forward). */
export function zonedTimeToEpoch(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): number {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = target - seen;
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}

/** 'YYYY-MM-DD' for the Chicago calendar day containing `ms`. */
export function zonedDateKey(ms: number): string {
  const p = zonedParts(ms);
  return formatDateKey(p.year, p.month, p.day);
}

export function formatDateKey(
  year: number,
  month: number,
  day: number
): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDateKey(
  key: string
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** Aug 1, 00:00 Chicago of the school year containing `now`. */
export function schoolYearStart(now: number): number {
  const p = zonedParts(now);
  const year = p.month >= 8 ? p.year : p.year - 1;
  return zonedTimeToEpoch(year, 8, 1);
}
