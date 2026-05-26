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
  // Intentional `||` (not `??`): an empty-string endTime must also fall back
  // to startTime, matching how endTime is treated elsewhere in the widget.
  // parseTime would return -1 for '' anyway, but doing the fallback here
  // preserves the valid startTime path.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const effectiveMinutes = parseTime(endTime || startTime);
  if (effectiveMinutes < 0) return false; // unparseable — do not flag as past
  return effectiveMinutes < nowMinutes;
};
