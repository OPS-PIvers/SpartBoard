// Sub share days: the teacher picks the first and last day, and the share ends up to 48 hours after.

export const SUB_SHARE_GRACE_MS = 48 * 60 * 60 * 1000;
export const SUB_SHARE_MAX_MS = 14 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` for a date input, in local time. */
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DDTHH:mm` for a datetime-local input, in local time. */
export function toDateTimeInput(ms: number): string {
  const d = new Date(ms);
  return `${toDateInput(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDay(value: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
}

/** Local midnight that starts the day, or NaN. */
export function dayStart(value: string): number {
  const p = parseDay(value);
  return p ? new Date(p[0], p[1], p[2]).getTime() : NaN;
}

/** 11:59 PM local on the day, or NaN. */
export function dayEnd(value: string): number {
  const p = parseDay(value);
  return p ? new Date(p[0], p[1], p[2], 23, 59).getTime() : NaN;
}

/** The latest a share may end: 48 hours after the last day, never past the 14-day cap. */
export function latestEnd(lastDay: string, now: number): number {
  const cap = Math.floor((now + SUB_SHARE_MAX_MS) / 60000) * 60000;
  return Math.min(dayEnd(lastDay) + SUB_SHARE_GRACE_MS, cap);
}

/** The last day a teacher may pick, so the share still fits the 14-day cap. */
export function lastPickableDay(now: number): string {
  return toDateInput(now + SUB_SHARE_MAX_MS - DAY_MS);
}

export type SubShareDatesError =
  'badDay' | 'lastBeforeFirst' | 'endPast' | 'endBeforeOpen' | 'endTooLate';

/** Checks the picked days and end, and returns what to save. */
export function resolveSubShareDates(
  firstDay: string,
  lastDay: string,
  endsAt: string,
  now: number,
  /** An end already saved on the share (for example after Add a week) that may stay past the usual limit. */
  savedEnd?: number
):
  | {
      ok: true;
      availableFrom: number;
      availableThrough: number;
      expiresAt: number;
    }
  | { ok: false; error: SubShareDatesError } {
  const availableFrom = dayStart(firstDay);
  const availableThrough = dayEnd(lastDay);
  if (!Number.isFinite(availableFrom) || !Number.isFinite(availableThrough)) {
    return { ok: false, error: 'badDay' };
  }
  if (availableThrough < availableFrom) {
    return { ok: false, error: 'lastBeforeFirst' };
  }
  const expiresAt = new Date(endsAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { ok: false, error: 'endPast' };
  }
  if (expiresAt <= availableFrom) {
    return { ok: false, error: 'endBeforeOpen' };
  }
  if (expiresAt > latestEnd(lastDay, now) && expiresAt !== savedEnd) {
    return { ok: false, error: 'endTooLate' };
  }
  return { ok: true, availableFrom, availableThrough, expiresAt };
}
