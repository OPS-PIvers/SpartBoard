/**
 * Parses an "HH:MM" time string and returns minutes since midnight.
 * Returns -1 if the string is missing, empty, or not a valid "HH:MM" value.
 */
export const parseTime = (t: string | undefined): number => {
  if (!t || !t.includes(':')) return -1;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
};

/**
 * Determines whether a schedule item should be rendered as "past".
 *
 * Rules:
 *   - An already-active item is never past.
 *   - An item whose effective end time (endTime if present, otherwise
 *     startTime) cannot be parsed is never past — rendering it as completed
 *     when it has no valid time data would be misleading.
 *   - Otherwise, the item is past when its effective end time is strictly
 *     before the current minute count.
 */
export const computeIsPast = (
  endTime: string | undefined,
  startTime: string | undefined,
  isActive: boolean,
  nowMinutes: number
): boolean => {
  if (isActive) return false;
  // Use || (not ??) so an empty-string endTime falls back to startTime,
  // matching how endTime is treated elsewhere in the widget.
  const effectiveMinutes = parseTime(endTime || startTime);
  if (effectiveMinutes < 0) return false; // unparseable — do not flag as past
  return effectiveMinutes < nowMinutes;
};
