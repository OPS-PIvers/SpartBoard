/** A timeline date: `year` is negative for BCE (no year zero); month and day are optional. */
export interface WallDate {
  year: number;
  month?: number;
  day?: number;
}

export type WallEra = 'CE' | 'BCE';

/** Raw composer fields; empty strings mean "not given". */
export interface WallDateFields {
  year: string;
  era: WallEra;
  month: string;
  day: string;
}

export const MAX_CE_YEAR = 9999;
export const MAX_BCE_YEAR = 999999;

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const EMPTY_DATE_FIELDS: WallDateFields = {
  year: '',
  era: 'CE',
  month: '',
  day: '',
};

const isLeap = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Days in a month; BCE years use the proleptic rule on their astronomical year. */
export const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeap(year < 0 ? year + 1 : year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

const withCommas = (n: number) =>
  n >= 10000 ? n.toLocaleString('en-US') : String(n);

/** Year as students read it: "1865", "44 BCE". */
export const formatYear = (year: number): string =>
  year < 0 ? `${withCommas(-year)} BCE` : withCommas(year);

/** Display text, which is also what the post stores: "1865", "April 1865", "April 14, 1865", "44 BCE". */
export const formatWallDate = (date: WallDate): string => {
  const year = formatYear(date.year);
  if (!date.month) return year;
  const month = MONTH_NAMES[date.month - 1];
  return date.day ? `${month} ${date.day}, ${year}` : `${month} ${year}`;
};

/** Checks the composer fields; returns the date or the message to show. */
export const validateDateFields = (
  fields: WallDateFields
): { date: WallDate } | { error: string } => {
  const raw = fields.year.replace(/,/g, '').trim();
  if (!raw) return { error: 'Enter a year.' };
  if (!/^\d+$/.test(raw)) return { error: 'Use numbers only for the year.' };
  const value = Number(raw);
  const max = fields.era === 'BCE' ? MAX_BCE_YEAR : MAX_CE_YEAR;
  if (value < 1 || value > max)
    return { error: `Enter a year from 1 to ${max.toLocaleString('en-US')}.` };
  const year = fields.era === 'BCE' ? -value : value;
  if (!fields.month) return { date: { year } };
  const month = Number(fields.month);
  if (!fields.day) return { date: { year, month } };
  const day = Number(fields.day);
  if (day < 1 || day > daysInMonth(year, month))
    return { error: `${MONTH_NAMES[month - 1]} doesn't have ${day} days.` };
  return { date: { year, month, day } };
};

/** Composer fields for an existing date, so editing starts from what was saved. */
export const fieldsFromDate = (date: WallDate | null): WallDateFields =>
  date
    ? {
        year: String(Math.abs(date.year)),
        era: date.year < 0 ? 'BCE' : 'CE',
        month: date.month ? String(date.month) : '',
        day: date.day ? String(date.day) : '',
      }
    : EMPTY_DATE_FIELDS;

const MONTH_LOOKUP = new Map<string, number>(
  MONTH_NAMES.flatMap((name, i) => [
    [name.toLowerCase(), i + 1] as const,
    [name.slice(0, 3).toLowerCase(), i + 1] as const,
  ])
);

const YEAR_PART =
  /^(?:c\.?|ca\.?|circa|about|around)?\s*(\d{1,3}(?:,\d{3})+|\d{1,6})\s*('?s)?\s*(bce|bc|b\.c\.e?\.?|ce|ad|a\.d\.)?$/i;
const LEADING_AD = /^(?:ad|a\.d\.)\s+(\d{1,4})$/i;

const yearFrom = (text: string): number | null => {
  const ad = LEADING_AD.exec(text);
  if (ad) return Number(ad[1]) || null;
  const match = YEAR_PART.exec(text);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  if (value < 1) return null;
  const bce = Boolean(match[3]) && /^b/i.test(match[3]);
  if (bce) return value <= MAX_BCE_YEAR ? -value : null;
  return value <= MAX_CE_YEAR ? value : null;
};

/**
 * Reads a post's stored label back into a date: exact for labels this composer wrote,
 * best effort for older free-text ones ("1800s", "500 BC", "March 4, 1865"); null when undated.
 */
export const parseWallDate = (label: string | undefined): WallDate | null => {
  const text = (label ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const plain = yearFrom(text);
  if (plain !== null) return { year: plain };

  const words = text.replace(/,/g, ' ').split(' ').filter(Boolean);
  const monthAt = words.findIndex((w) =>
    MONTH_LOOKUP.has(w.toLowerCase().replace(/\.$/, ''))
  );
  if (monthAt === -1) return null;
  const month = MONTH_LOOKUP.get(
    words[monthAt].toLowerCase().replace(/\.$/, '')
  ) as number;
  const rest = words.filter((_, i) => i !== monthAt);
  // "April 14 1865 BCE" or "14 April 1865": an optional day, then the year.
  const dayText = rest.length > 1 && /^\d{1,2}$/.test(rest[0]) ? rest[0] : '';
  const yearText = (dayText ? rest.slice(1) : rest).join(' ');
  const year = yearFrom(yearText);
  if (year === null) return null;
  if (!dayText) return { year, month };
  const day = Number(dayText);
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
};

/** Position on the axis in years; BCE counts back from zero so "500 BCE" sits on the 500 tick. */
export const dateSortKey = (date: WallDate): number => {
  let key = date.year;
  if (date.month) {
    const days = daysInMonth(date.year, date.month);
    const within = date.day ? (date.day - 0.5) / days : 0;
    key += (date.month - 1 + within) / 12;
  }
  return key;
};
