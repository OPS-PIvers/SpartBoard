/**
 * Daily active-user history for the Analytics Overview.
 *
 * The nightly recompute writes one doc per day at
 * `/organizations/{orgId}/analytics_days/{YYYY-MM-DD}` holding the uids
 * active in the previous 24h, and the same shape for SSO students under
 * `analytics_student_days`. Days before the first measured run can be
 * filled once from dated records (`estimated: true`). The snapshot carries
 * the derived series, sign-up months and retention cohorts, never the uids.
 */

import * as admin from 'firebase-admin';

export interface DayActivityDoc {
  date: string;
  activeUids: string[];
  estimated: boolean;
}

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
  // Percent of the cohort active in each month since sign-up; null = no data.
  retained: (number | null)[];
}

export interface RetentionCell {
  pct: number;
  active: number;
  // Teachers this cell is based on.
  n: number;
  // Includes the current month, which is not over yet.
  partial: boolean;
}

export interface RetentionRow {
  // `YYYY-MM` for a sign-up month, `YYYY-spring` or `YYYY-fall` for a season.
  key: string;
  users: number;
  // Per school month since sign-up (June and July skipped); null = before history.
  cells: (RetentionCell | null)[];
  // Of this row's teachers active in spring, how many were active that September.
  fallReturn: FallReturn | null;
}

export interface FallReturn {
  year: number;
  spring: number;
  returned: number;
  partial: boolean;
}

export interface Retention {
  currentMonth: string;
  byMonth: RetentionRow[];
  bySeason: RetentionRow[];
  fallReturn: FallReturn | null;
}

export interface AnalyticsHistory {
  days: ActivityPoint[];
  // SSO students, from analytics_student_days; omitted when the student read fails.
  studentDays?: ActivityPoint[];
  newUsersByMonth: MonthCount[];
  // Calendar-month cohorts kept for clients older than `retention`.
  cohorts: CohortRow[];
  retention?: Retention;
}

const MAU_WINDOW_DAYS = 30;
const MAX_COHORT_ROWS = 12;
const MAX_COHORT_MONTHS = 12;
const MAX_SEASON_ROWS = 6;

const CHICAGO_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` in district time, so evening activity stays on its school day. */
export function chicagoDateKey(ms: number): string {
  return CHICAGO_DATE.format(new Date(ms));
}

/** The day a 5 AM run reports on: the 24h window that just closed. */
export function measuredDateKey(runMs: number): string {
  return chicagoDateKey(runMs - 6 * 60 * 60 * 1000);
}

const CHICAGO_HOUR = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  hour: 'numeric',
  hourCycle: 'h23',
});

export function chicagoHour(ms: number): number {
  return Number(CHICAGO_HOUR.format(new Date(ms)));
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Next top of an hour after `ms` whose district-time hour is in `hours`. */
export function nextChicagoHourMs(
  ms: number,
  hours: readonly number[]
): number {
  let t = Math.floor(ms / ONE_HOUR_MS) * ONE_HOUR_MS + ONE_HOUR_MS;
  for (let i = 0; i < 48; i++, t += ONE_HOUR_MS) {
    if (hours.includes(chicagoHour(t))) return t;
  }
  return ms + 24 * ONE_HOUR_MS;
}

export const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const monthOf = (date: string) => date.slice(0, 7);

const monthsBetween = (from: string, to: string): number => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
};

const addMonths = (month: string, n: number): string => {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

/** Daily DAU plus trailing 30-day MAU for every date from the first doc to the last. */
export function buildActivitySeries(docs: DayActivityDoc[]): ActivityPoint[] {
  if (docs.length === 0) return [];
  const byDate = new Map(docs.map((d) => [d.date, d]));
  const sorted = [...byDate.keys()].sort();
  const firstMeasured = sorted.find((d) => !byDate.get(d)?.estimated);
  const last = sorted[sorted.length - 1];

  const points: ActivityPoint[] = [];
  const window: string[][] = [];
  for (let date = sorted[0]; date <= last; date = addDays(date, 1)) {
    const uids = byDate.get(date)?.activeUids ?? [];
    window.push(uids);
    if (window.length > MAU_WINDOW_DAYS) window.shift();
    const mau = new Set(window.flat()).size;
    points.push({
      date,
      dau: uids.length,
      mau,
      estimated: firstMeasured === undefined || date < firstMeasured,
    });
  }
  return points;
}

/** Sign-ups per calendar month, with empty months included. */
export function buildNewUsersByMonth(
  signupMs: number[],
  nowMs: number
): MonthCount[] {
  const valid = signupMs.filter((ms) => ms > 0);
  if (valid.length === 0) return [];
  const counts = new Map<string, number>();
  for (const ms of valid) {
    const m = monthOf(chicagoDateKey(ms));
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const first = [...counts.keys()].sort()[0];
  const lastMonth = monthOf(chicagoDateKey(nowMs));
  const out: MonthCount[] = [];
  for (let m = first; m <= lastMonth; m = addMonths(m, 1)) {
    out.push({ month: m, count: counts.get(m) ?? 0 });
  }
  return out;
}

/** Share of each sign-up month still active in each later month. */
export function buildCohorts(
  signupByUid: Map<string, number>,
  docs: DayActivityDoc[],
  nowMs: number
): CohortRow[] {
  if (docs.length === 0) return [];
  const activeMonths = new Map<string, Set<string>>();
  let firstDay = docs[0].date;
  for (const doc of docs) {
    if (doc.date < firstDay) firstDay = doc.date;
    const month = monthOf(doc.date);
    for (const uid of doc.activeUids) {
      let set = activeMonths.get(uid);
      if (!set) activeMonths.set(uid, (set = new Set()));
      set.add(month);
    }
  }
  const firstHistoryMonth = monthOf(firstDay);
  const currentMonth = monthOf(chicagoDateKey(nowMs));

  const cohorts = new Map<string, string[]>();
  for (const [uid, ms] of signupByUid) {
    if (ms <= 0) continue;
    const month = monthOf(chicagoDateKey(ms));
    const list = cohorts.get(month) ?? [];
    list.push(uid);
    cohorts.set(month, list);
  }

  return [...cohorts.keys()]
    .sort()
    .slice(-MAX_COHORT_ROWS)
    .map((month) => {
      const uids = cohorts.get(month) ?? [];
      const span = Math.min(
        monthsBetween(month, currentMonth) + 1,
        MAX_COHORT_MONTHS
      );
      const retained: (number | null)[] = [];
      for (let k = 0; k < span; k++) {
        const target = addMonths(month, k);
        if (target < firstHistoryMonth) {
          retained.push(null);
          continue;
        }
        const active = uids.filter((uid) =>
          activeMonths.get(uid)?.has(target)
        ).length;
        retained.push(Math.round((active / uids.length) * 100));
      }
      return { month, users: uids.length, retained };
    });
}

const isSummer = (month: string) => {
  const m = month.slice(5);
  return m === '06' || m === '07';
};

/** First school month on or after `month`: June and July roll forward to August. */
const firstSchoolMonth = (month: string): string =>
  isSummer(month) ? `${month.slice(0, 4)}-08` : month;

/** The school month `k` school months after `month`, skipping June and July. */
export function addSchoolMonths(month: string, k: number): string {
  let m = firstSchoolMonth(month);
  for (let i = 0; i < k; i++) m = firstSchoolMonth(addMonths(m, 1));
  return m;
}

/** Spring is January to May; fall is June to December, so summer sign-ups join fall. */
export const seasonKey = (month: string): string =>
  `${month.slice(0, 4)}-${Number(month.slice(5)) <= 5 ? 'spring' : 'fall'}`;

const seasonOrder = (key: string) =>
  Number(key.slice(0, 4)) * 2 + (key.endsWith('fall') ? 1 : 0);

/** Latest September with history; its spring is the one teachers return from. */
function fallReturnYear(firstHistoryMonth: string, currentMonth: string) {
  let year = Number(currentMonth.slice(0, 4));
  if (`${year}-09` > currentMonth) year -= 1;
  if (`${year}-05` < firstHistoryMonth) return null;
  return year;
}

function retentionRow(
  key: string,
  members: { uid: string; month: string }[],
  activeMonths: Map<string, Set<string>>,
  firstHistoryMonth: string,
  currentMonth: string,
  returnYear: number | null
): RetentionRow {
  const cells: (RetentionCell | null)[] = [];
  for (let k = 0; k < MAX_COHORT_MONTHS; k++) {
    // Teachers whose month k is the current one count only when no one has a finished month k.
    const full = { n: 0, active: 0 };
    const current = { n: 0, active: 0 };
    let reached = false;
    let finished = false;
    for (const { uid, month } of members) {
      const target = addSchoolMonths(month, k);
      if (target > currentMonth) continue;
      reached = true;
      if (target < currentMonth) finished = true;
      if (target < firstHistoryMonth) continue;
      const tally = target === currentMonth ? current : full;
      tally.n++;
      if (activeMonths.get(uid)?.has(target)) tally.active++;
    }
    if (!reached) break;
    const partial = !finished;
    const { n, active } = partial ? current : full;
    cells.push(
      n === 0
        ? null
        : { pct: Math.round((active / n) * 100), active, n, partial }
    );
  }
  return {
    key,
    users: members.length,
    cells,
    fallReturn:
      returnYear === null
        ? null
        : fallReturnOf(
            members.map((m) => m.uid),
            activeMonths,
            returnYear,
            currentMonth
          ),
  };
}

function fallReturnOf(
  uids: Iterable<string>,
  activeMonths: Map<string, Set<string>>,
  year: number,
  currentMonth: string
): FallReturn | null {
  const springMonths = ['01', '02', '03', '04', '05'].map(
    (m) => `${year}-${m}`
  );
  const september = `${year}-09`;
  let spring = 0;
  let returned = 0;
  for (const uid of uids) {
    const months = activeMonths.get(uid);
    if (!months || !springMonths.some((m) => months.has(m))) continue;
    spring++;
    if (months.has(september)) returned++;
  }
  if (spring === 0) return null;
  return { year, spring, returned, partial: september === currentMonth };
}

/** School-year retention: June and July skipped, by sign-up month and by season. */
export function buildRetention(
  signupByUid: Map<string, number>,
  docs: DayActivityDoc[],
  nowMs: number
): Retention | undefined {
  if (docs.length === 0) return undefined;
  const activeMonths = new Map<string, Set<string>>();
  let firstDay = docs[0].date;
  for (const doc of docs) {
    if (doc.date < firstDay) firstDay = doc.date;
    const month = monthOf(doc.date);
    for (const uid of doc.activeUids) {
      let set = activeMonths.get(uid);
      if (!set) activeMonths.set(uid, (set = new Set()));
      set.add(month);
    }
  }
  const firstHistoryMonth = monthOf(firstDay);
  const currentMonth = monthOf(chicagoDateKey(nowMs));
  const returnYear = fallReturnYear(firstHistoryMonth, currentMonth);

  const byMonth = new Map<string, { uid: string; month: string }[]>();
  const bySeason = new Map<string, { uid: string; month: string }[]>();
  for (const [uid, ms] of signupByUid) {
    if (ms <= 0) continue;
    const month = monthOf(chicagoDateKey(ms));
    if (month > currentMonth) continue;
    const member = { uid, month };
    for (const [groups, key] of [
      [byMonth, month],
      [bySeason, seasonKey(month)],
    ] as const) {
      const list = groups.get(key);
      if (list) list.push(member);
      else groups.set(key, [member]);
    }
  }

  const rows = (
    groups: Map<string, { uid: string; month: string }[]>,
    keys: string[]
  ) =>
    keys.map((key) =>
      retentionRow(
        key,
        groups.get(key) ?? [],
        activeMonths,
        firstHistoryMonth,
        currentMonth,
        returnYear
      )
    );

  return {
    currentMonth,
    byMonth: rows(byMonth, [...byMonth.keys()].sort().slice(-MAX_COHORT_ROWS)),
    bySeason: rows(
      bySeason,
      [...bySeason.keys()]
        .sort((a, b) => seasonOrder(a) - seasonOrder(b))
        .slice(-MAX_SEASON_ROWS)
    ),
    fallReturn:
      returnYear === null
        ? null
        : fallReturnOf(
            signupByUid.keys(),
            activeMonths,
            returnYear,
            currentMonth
          ),
  };
}

/** Groups dated (uid, timestamp) events into estimated day docs before `beforeDate`. */
export function estimateActivityDays(
  events: Iterable<[string, number]>,
  beforeDate: string
): DayActivityDoc[] {
  const byDate = new Map<string, Set<string>>();
  for (const [uid, ms] of events) {
    if (!uid || !(ms > 0)) continue;
    const date = chicagoDateKey(ms);
    if (date >= beforeDate) continue;
    let set = byDate.get(date);
    if (!set) byDate.set(date, (set = new Set()));
    set.add(uid);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, uids]) => ({
      date,
      activeUids: [...uids].sort(),
      estimated: true,
    }));
}

export type ActivityKind = 'staff' | 'students';

const dayCollection = (orgId: string, kind: ActivityKind) =>
  admin
    .firestore()
    .collection(
      `organizations/${orgId}/${kind === 'students' ? 'analytics_student_days' : 'analytics_days'}`
    );

export async function readActivityDays(
  orgId: string,
  kind: ActivityKind = 'staff'
): Promise<DayActivityDoc[]> {
  const snap = await dayCollection(orgId, kind).get();
  return snap.docs.map((doc) => {
    const data = doc.data() as { activeUids?: unknown; estimated?: unknown };
    return {
      date: doc.id,
      activeUids: Array.isArray(data.activeUids)
        ? data.activeUids.filter((u): u is string => typeof u === 'string')
        : [],
      estimated: data.estimated === true,
    };
  });
}

export async function writeActivityDays(
  orgId: string,
  docs: DayActivityDoc[],
  kind: ActivityKind = 'staff'
): Promise<void> {
  const col = dayCollection(orgId, kind);
  for (let i = 0; i < docs.length; i += 400) {
    const batch = admin.firestore().batch();
    for (const doc of docs.slice(i, i + 400)) {
      batch.set(col.doc(doc.date), {
        activeUids: doc.activeUids,
        estimated: doc.estimated,
      });
    }
    await batch.commit();
  }
}
