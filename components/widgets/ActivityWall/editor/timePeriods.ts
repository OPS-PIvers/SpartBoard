import type { ActivityWallPeriod } from '@/types';
import {
  dateEndKey,
  dateStartKey,
  parseWallDate,
} from '@/components/activityWall/render/timelineDates';

/** What is wrong with a time period row, or null when it is fine or still blank. */
export const timePeriodError = (period: ActivityWallPeriod): string | null => {
  const from = period.from.trim();
  const to = period.to.trim();
  if (!period.label.trim() && !from && !to) return null;
  if (!from || !to) return 'Add a start and an end.';
  const start = parseWallDate(from);
  const end = parseWallDate(to);
  if (!start || !end) return 'Enter dates like 1861 or 500 BCE.';
  if (dateEndKey(end) <= dateStartKey(start))
    return 'End must be after the start.';
  if (!period.label.trim()) return 'Give this time period a name.';
  return null;
};

/** Rows to save: blank rows drop out; trimmed text otherwise. */
export const cleanTimePeriods = (
  periods: ActivityWallPeriod[] | undefined
): ActivityWallPeriod[] =>
  (periods ?? [])
    .map((period) => ({
      ...period,
      label: period.label.trim(),
      from: period.from.trim(),
      to: period.to.trim(),
    }))
    .filter((period) => period.label || period.from || period.to);
