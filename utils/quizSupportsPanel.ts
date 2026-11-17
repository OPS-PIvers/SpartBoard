// Height of the Supports section above the sources, as a percent of the left panel.
export const SUPPORTS_PCT_DEFAULT = 40;
export const SUPPORTS_PCT_MIN = 15;
export const SUPPORTS_PCT_MAX = 85;

export const clampSupportsPct = (pct: number): number =>
  Math.min(SUPPORTS_PCT_MAX, Math.max(SUPPORTS_PCT_MIN, pct));

/** Arrow keys move the bar 5%, Home and End go to the ends, Enter resets it. */
export function supportsPctForKey(key: string, pct: number): number | null {
  if (key === 'ArrowUp') return clampSupportsPct(pct - 5);
  if (key === 'ArrowDown') return clampSupportsPct(pct + 5);
  if (key === 'Home') return SUPPORTS_PCT_MIN;
  if (key === 'End') return SUPPORTS_PCT_MAX;
  if (key === 'Enter') return SUPPORTS_PCT_DEFAULT;
  return null;
}
