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
