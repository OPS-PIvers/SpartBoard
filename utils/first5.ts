/** Hour (0-23) before which the previous calendar day is used for day numbering. */
export const ROLLOVER_HOUR = 6;

/** Strips the time component from a Date, returning midnight local time. */
export function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Counts weekdays (Mon-Fri) between two dates, excluding start, including end.
 * Positive if end > start, negative if end < start.
 */
export function countWeekdaysBetween(start: Date, end: Date): number {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const sign = endMs >= startMs ? 1 : -1;
  const [from, to] = sign === 1 ? [start, end] : [end, start];

  let count = 0;
  const cursor = new Date(from);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= to) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count * sign;
}

/**
 * Computes the current First 5 day number from a stored reference point.
 * Before {@link ROLLOVER_HOUR}, the previous calendar day is used so that
 * early-morning access still shows the prior school day's content.
 */
export function computeCurrentDayNumber(
  activeDayNumber: number,
  referenceDate: string,
  now: Date = new Date()
): number {
  const ref = stripTime(new Date(referenceDate + 'T00:00:00'));

  // Before rollover hour, use previous calendar day
  const effective = new Date(now);
  if (effective.getHours() < ROLLOVER_HOUR) {
    effective.setDate(effective.getDate() - 1);
  }
  const today = stripTime(effective);

  return activeDayNumber + countWeekdaysBetween(ref, today);
}
