const BARE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Bare "YYYY-MM-DD" values parse as UTC midnight, which normalizeDate's local getters then read as the prior calendar day in negative-UTC-offset zones.
export const parseConfigDate = (value: string): Date => {
  const match = BARE_DATE_RE.exec(value);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), 12);
  }
  return new Date(value);
};

const MS_PER_DAY = 86_400_000;

const dayNumber = (d: Date): number =>
  Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY);

// Counts local calendar days in [from, to) without iterating, so a far-future date can't freeze the widget.
export const countDaysBetween = (
  from: Date,
  to: Date,
  includeWeekends: boolean
): number => {
  const start = dayNumber(from);
  const end = dayNumber(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return 0;
  const total = end - start;
  if (includeWeekends) return total;
  const weeks = Math.floor(total / 7);
  let days = weeks * 5;
  for (let n = start + weeks * 7; n < end; n++) {
    // Day 0 (1970-01-01) was a Thursday.
    const dow = (((n + 4) % 7) + 7) % 7;
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
};
