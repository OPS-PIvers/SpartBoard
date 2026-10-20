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

export interface RetentionCell {
  pct: number;
  active: number;
  n: number;
  partial: boolean;
}

export interface FallReturn {
  year: number;
  spring: number;
  returned: number;
  partial: boolean;
}

export interface RetentionRow {
  key: string;
  users: number;
  cells: (RetentionCell | null)[];
  fallReturn: FallReturn | null;
}

export interface Retention {
  currentMonth: string;
  byMonth: RetentionRow[];
  bySeason: RetentionRow[];
  fallReturn: FallReturn | null;
}

export interface AnalyticsHistory {
  days: ActivityPoint[];
  studentDays?: ActivityPoint[];
  newUsersByMonth: MonthCount[];
  cohorts: CohortRow[];
  retention?: Retention;
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

/** Per-day sum of two series; a day is estimated when either side is. */
export function combineDays(
  a: ActivityPoint[],
  b: ActivityPoint[]
): ActivityPoint[] {
  const out = new Map<string, ActivityPoint>();
  for (const d of [...a, ...b]) {
    const prev = out.get(d.date);
    out.set(
      d.date,
      prev
        ? {
            date: d.date,
            dau: prev.dau + d.dau,
            mau: prev.mau + d.mau,
            estimated: prev.estimated || d.estimated,
          }
        : { ...d }
    );
  }
  return [...out.values()].sort((x, y) => x.date.localeCompare(y.date));
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

// `YYYY-spring` / `YYYY-fall` season keys, else a `YYYY-MM` sign-up month.
export const formatCohortKey = (key: string): string => {
  const [year, part] = key.split('-');
  if (part === 'spring') return `Spring ${year}`;
  if (part === 'fall') return `Fall ${year}`;
  return formatMonth(key);
};

// Snapshots written before `retention` existed only carry calendar-month cohorts.
export const legacyRetentionRows = (cohorts: CohortRow[]): RetentionRow[] =>
  cohorts.map((c) => ({
    key: c.month,
    users: c.users,
    cells: c.retained.map((pct) =>
      pct === null
        ? null
        : {
            pct,
            active: Math.round((pct * c.users) / 100),
            n: c.users,
            partial: false,
          }
    ),
    fallReturn: null,
  }));

const FULL_WEIGHT_TEACHERS = 30;

// 0-1 strength of a cell: about 0.4 for one teacher, full from 30.
export const cohortWeight = (n: number): number =>
  0.25 +
  0.75 *
    Math.min(
      1,
      Math.log(1 + Math.max(0, n)) / Math.log(1 + FULL_WEIGHT_TEACHERS)
    );
