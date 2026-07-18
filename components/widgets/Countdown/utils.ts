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
