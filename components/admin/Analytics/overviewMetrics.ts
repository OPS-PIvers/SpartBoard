export interface ActivityPoint {
  date: string;
  dau: number;
  mau: number;
  estimated: boolean;
}

export interface MonthCount {
  month: string;
  count: number;
}

export interface CohortRow {
  month: string;
  users: number;
  retained: (number | null)[];
}

export interface AnalyticsHistory {
  days: ActivityPoint[];
  studentDays?: ActivityPoint[];
  newUsersByMonth: MonthCount[];
  cohorts: CohortRow[];
}

export interface ActivityUser {
  lastSignInMs: number;
  lastEditMs: number;
  lastActiveMs?: number;
}

export type ActivityRange = '90d' | '1y' | 'all';

export interface WeekPoint {
  week: string;
  dau: number;
  mau: number;
  estimated: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Snapshots written before lastActiveMs existed fall back to edit and sign-in times.
export const lastActiveOf = (u: ActivityUser): number =>
  u.lastActiveMs ?? Math.max(u.lastEditMs ?? 0, u.lastSignInMs ?? 0);

const parseDate = (date: string) => new Date(`${date}T12:00:00Z`);
const isWeekday = (date: string) => {
  const day = parseDate(date).getUTCDay();
  return day !== 0 && day !== 6;
};

const weekStart = (date: string): string => {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
};

export function filterRange(
  days: ActivityPoint[],
  range: ActivityRange
): ActivityPoint[] {
  if (range === 'all' || days.length === 0) return days;
  const last = parseDate(days[days.length - 1].date).getTime();
  const span = range === '90d' ? 90 : 365;
  const cutoff = new Date(last - span * DAY_MS).toISOString().slice(0, 10);
  return days.filter((d) => d.date > cutoff);
}

/** Weekly points: average school-day DAU and the week's closing MAU. */
export function toWeekly(days: ActivityPoint[]): WeekPoint[] {
  const weeks = new Map<string, ActivityPoint[]>();
  for (const day of days) {
    const key = weekStart(day.date);
    const list = weeks.get(key) ?? [];
    list.push(day);
    weeks.set(key, list);
  }
  return [...weeks.entries()].map(([week, list]) => {
    const school = list.filter((d) => isWeekday(d.date));
    const pool = school.length > 0 ? school : list;
    return {
      week,
      dau: Math.round(pool.reduce((sum, d) => sum + d.dau, 0) / pool.length),
      mau: list[list.length - 1].mau,
      estimated: list.some((d) => d.estimated),
    };
  });
}

export interface ChartWeek {
  week: string;
  dau?: number;
  mau?: number;
  studentDau?: number;
  studentMau?: number;
  estimated: boolean;
}

/** Joins staff and student weeks; a week missing from one series leaves a gap in its lines. */
export function joinWeeks(
  staff: WeekPoint[],
  students: WeekPoint[]
): ChartWeek[] {
  const out = new Map<string, ChartWeek>();
  for (const w of staff) out.set(w.week, { ...w });
  for (const w of students) {
    const row = out.get(w.week) ?? { week: w.week, estimated: false };
    row.studentDau = w.dau;
    row.studentMau = w.mau;
    row.estimated = row.estimated || w.estimated;
    out.set(w.week, row);
  }
  return [...out.values()].sort((a, b) => a.week.localeCompare(b.week));
}

export interface ActivityStats {
  stickiness: number | null;
  mauChange: number | null;
  peak: ActivityPoint | null;
}

export function activityStats(days: ActivityPoint[]): ActivityStats {
  if (days.length === 0)
    return { stickiness: null, mauChange: null, peak: null };
  const last = days[days.length - 1];
  const recentSchoolDays = days.slice(-30).filter((d) => isWeekday(d.date));
  const avgDau =
    recentSchoolDays.length > 0
      ? recentSchoolDays.reduce((sum, d) => sum + d.dau, 0) /
        recentSchoolDays.length
      : 0;
  const monthAgo = days.length > 30 ? days[days.length - 31] : null;
  const peak = days.reduce((best, d) => (d.dau > best.dau ? d : best), days[0]);
  return {
    stickiness: last.mau > 0 ? Math.round((avgDau / last.mau) * 100) : null,
    mauChange: monthAgo ? last.mau - monthAgo.mau : null,
    peak: peak.dau > 0 ? peak : null,
  };
}

export const RECENCY_BUCKETS = [
  'Today',
  'This week',
  'This month',
  '1–3 months',
  'Over 3 months',
  'Never signed in',
] as const;

/** Counts users by how long before `asOfMs` they were last active. */
export function recencyBuckets(
  users: ActivityUser[],
  asOfMs: number
): { name: (typeof RECENCY_BUCKETS)[number]; value: number }[] {
  const counts = RECENCY_BUCKETS.map(() => 0);
  for (const u of users) {
    const last = lastActiveOf(u);
    const age = asOfMs - last;
    const idx =
      last <= 0
        ? 5
        : age <= DAY_MS
          ? 0
          : age <= 7 * DAY_MS
            ? 1
            : age <= 30 * DAY_MS
              ? 2
              : age <= 90 * DAY_MS
                ? 3
                : 4;
    counts[idx] += 1;
  }
  return RECENCY_BUCKETS.map((name, i) => ({ name, value: counts[i] }));
}

export const formatMonth = (month: string, withYear = true): string =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });

export const formatDay = (date: string): string =>
  parseDate(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

export const formatRelativeTime = (ms: number): string => {
  if (ms <= 0) return 'Never';
  const diff = Date.now() - ms;
  if (diff < 0) return 'Just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
};
