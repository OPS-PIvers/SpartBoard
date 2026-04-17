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
