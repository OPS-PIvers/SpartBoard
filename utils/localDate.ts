/**
 * Returns today's date in the teacher's local timezone as an ISO-style
 * `YYYY-MM-DD` string. Uses local getters (not UTC) because school days
 * cross UTC midnight mid-session in most US timezones — a teacher marking
 * a student absent at 2pm CT on March 5 should see the mark clear at
 * local midnight, not at 7pm CT when UTC rolls over.
 */
export function getLocalIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Combine a `YYYY-MM-DD` date and `HH:MM` time into a millisecond timestamp
 * using local-time semantics. Returns null when either piece is missing,
 * malformed, or out of range.
 *
 * Wall-clock interpretation matches the admin's intent across timezones —
 * "May 5, 8:00 AM" means 8:00 AM in the school's local time, not UTC.
 *
 * Strict range + round-trip validation: rejects out-of-range components
 * (Feb 31, 25:00, etc.) instead of silently letting JS `Date` normalize
 * them (Feb 31 → Mar 3) and producing a misleading timestamp.
 */
export function combineDateAndTime(
  date: string | undefined,
  time: string | undefined
): number | null {
  if (!date || !time) return null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const y = Number(dateMatch[1]);
  const mo = Number(dateMatch[2]);
  const d = Number(dateMatch[3]);
  const h = Number(timeMatch[1]);
  const mi = Number(timeMatch[2]);
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    !Number.isFinite(h) ||
    !Number.isFinite(mi)
  ) {
    return null;
  }
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  if (h < 0 || h > 23) return null;
  if (mi < 0 || mi > 59) return null;
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  // Round-trip check: catches Feb 31 → Mar 3 normalization, year overflow, etc.
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d ||
    dt.getHours() !== h ||
    dt.getMinutes() !== mi
  ) {
    return null;
  }
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Default end-of-day local time for a due-date picker when the teacher chooses a
 * date but no explicit time. `23:59` local reads as "due by the end of that day".
 */
export const DEFAULT_DUE_TIME = '23:59';

/**
 * Split a `dueAt` epoch (ms) into the `YYYY-MM-DD` + `HH:MM` strings a
 * date/time picker pair binds to, using LOCAL wall-clock components.
 *
 * Two value shapes are handled:
 *   - NEW values encode a local datetime (date + time picker → combineDateAndTime),
 *     so their local components round-trip exactly.
 *   - LEGACY date-only values were stored as UTC midnight (a bare
 *     `<input type="date">` → `new Date('YYYY-MM-DD')`). Read with local getters
 *     in a behind-UTC timezone (e.g. US-Central) those render as the PRIOR
 *     evening, so we instead surface the intended UTC calendar date + the
 *     default end-of-day time. SpartBoard is single-timezone (US-Central), where
 *     a genuine local-midnight pick never lands on UTC midnight, so this
 *     heuristic only ever catches the legacy date-only case.
 *
 * Returns an empty `date` (and the default `time`) when there is no due date.
 */
export function splitDueAtToInputs(dueAt: number | null | undefined): {
  date: string;
  time: string;
} {
  if (typeof dueAt !== 'number' || !Number.isFinite(dueAt) || dueAt <= 0) {
    return { date: '', time: DEFAULT_DUE_TIME };
  }
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return { date: '', time: DEFAULT_DUE_TIME };
  const isLegacyUtcMidnight =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (isLegacyUtcMidnight) {
    return { date: d.toISOString().slice(0, 10), time: DEFAULT_DUE_TIME };
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * Combine a due-date picker's `YYYY-MM-DD` + `HH:MM` strings into an epoch (ms).
 * No date → null (no due date). An empty time defaults to end-of-day so a
 * date-only pick still resolves to a concrete instant. Delegates to
 * combineDateAndTime for strict local-time parsing + range validation.
 */
export function dueInputsToEpoch(date: string, time: string): number | null {
  if (!date) return null;
  return combineDateAndTime(date, time || DEFAULT_DUE_TIME);
}
