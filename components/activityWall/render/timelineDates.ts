/** How exactly a post's date is known; exact dates may carry a month and day. */
export type WallDatePrecision = 'exact' | 'about' | 'decade' | 'century';

/**
 * A timeline date. `year` is negative for BCE (no year zero). A decade stores its first year
 * (CE only); a century stores its signed ordinal (19 is the 1800s, -5 the 5th century BCE).
 */
export interface WallDate {
  year: number;
  month?: number;
  day?: number;
  precision?: Exclude<WallDatePrecision, 'exact'>;
}

export type WallEra = 'CE' | 'BCE';

/** Raw composer fields; empty strings mean "not given". */
export interface WallDateFields {
  year: string;
  era: WallEra;
  month: string;
  day: string;
  precision: WallDatePrecision;
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
  precision: 'exact',
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

/** Year as students read it: "1865", "44 BCE", "79 CE" (short CE years name the era so they read as years). */
export const formatYear = (year: number): string =>
  year < 0
    ? `${withCommas(-year)} BCE`
    : year < 1000
      ? `${year} CE`
      : withCommas(year);

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** Display text, which is also what the post stores: "April 14, 1865", "c. 1450", "1990s", "5th century BCE". */
export const formatWallDate = (date: WallDate): string => {
  if (date.precision === 'about') return `c. ${formatYear(date.year)}`;
  if (date.precision === 'decade') {
    const end = date.year + 9;
    const era = date.year < 1000 ? ' CE' : '';
    return date.year % 100 === 0
      ? `${date.year}–${end}${era}`
      : `${date.year}s${era}`;
  }
  if (date.precision === 'century') {
    const name = `${ordinal(Math.abs(date.year))} century`;
    return date.year < 0 ? `${name} BCE` : name;
  }
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
  // Decades are CE only; the picker disables the option for BCE.
  const precision =
    fields.precision === 'decade' && (year < 0 || value < 10)
      ? 'about'
      : fields.precision;
  if (precision === 'about') return { date: { year, precision } };
  if (precision === 'decade')
    return { date: { year: Math.floor(value / 10) * 10, precision } };
  if (precision === 'century') {
    const number =
      year < 0
        ? Math.floor((value - 1) / 100) + 1
        : Math.floor(value / 100) + 1;
    return { date: { year: year < 0 ? -number : number, precision } };
  }
  if (!fields.month) return { date: { year } };
  const month = Number(fields.month);
  if (!fields.day) return { date: { year, month } };
  const day = Number(fields.day);
  if (day < 1 || day > daysInMonth(year, month))
    return { error: `${MONTH_NAMES[month - 1]} doesn't have ${day} days.` };
  return { date: { year, month, day } };
};

/** Composer fields for an existing date, so editing starts from what was saved. */
export const fieldsFromDate = (date: WallDate | null): WallDateFields => {
  if (!date) return EMPTY_DATE_FIELDS;
  const century = date.precision === 'century';
  // A century edits as its middle year: the 19th century shows 1850.
  const signed = century
    ? date.year < 0
      ? -(-date.year * 100 - 50)
      : (date.year - 1) * 100 + 50
    : date.year;
  return {
    year: String(Math.abs(signed)),
    era: signed < 0 ? 'BCE' : 'CE',
    month: date.month ? String(date.month) : '',
    day: date.day ? String(date.day) : '',
    precision: date.precision ?? 'exact',
  };
};

const MONTH_LOOKUP = new Map<string, number>(
  MONTH_NAMES.flatMap((name, i) => [
    [name.toLowerCase(), i + 1] as const,
    [name.slice(0, 3).toLowerCase(), i + 1] as const,
  ])
);
MONTH_LOOKUP.set('sept', 9);

const ERA = '(bce|bc|b\\.c\\.e?\\.?|ce|ad|a\\.d\\.)';
const YEAR_PART = new RegExp(
  `^(\\d{1,3}(?:,\\d{3})+|\\d{1,6})\\s*('?s)?\\s*${ERA}?$`,
  'i'
);
const LEADING_AD = /^(?:ad|a\.d\.)\s+(\d{1,4})$/i;
const ABOUT =
  /^(?:circa|ca\.?|c\.?|about|around|~|(?:early|mid|late|spring|summer|fall|autumn|winter)(?:\s+of)?)\s*(.+)$/i;
const NUMERIC = /^(\d{1,2})\/(?:(\d{1,2})\/)?(\d{3,4})$/;
const CENTURY = new RegExp(
  `^(?:the\\s+)?(\\d{1,5})(?:st|nd|rd|th)\\s+century(?:\\s+${ERA})?$`,
  'i'
);
const DECADE_RANGE = /^(\d{1,4})\s*[–-]\s*(\d{1,4})(?:\s*(?:ce|ad))?$/i;
const isBce = (era: string | undefined) =>
  Boolean(era) && /^b/i.test(era ?? '');

/** A year-only date: "1865", "500 BC", "1990s", "1800s", "AD 79". */
const yearDateFrom = (text: string): WallDate | null => {
  const ad = LEADING_AD.exec(text);
  if (ad) return Number(ad[1]) ? { year: Number(ad[1]) } : null;
  const match = YEAR_PART.exec(text);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  if (value < 1) return null;
  // A bare one- or two-digit number ("7", "May 5") is a step or a day, not a year.
  if (value < 100 && !match[2] && !match[3]) return null;
  const bce = isBce(match[3]);
  if (value > (bce ? MAX_BCE_YEAR : MAX_CE_YEAR)) return null;
  if (match[2] && value % 100 === 0) {
    // "1800s" is the 19th century; "500s BCE" the 6th century BCE.
    const number = value / 100 + 1;
    return { year: bce ? -number : number, precision: 'century' };
  }
  if (match[2] && value % 10 === 0)
    return bce
      ? { year: -value, precision: 'about' }
      : { year: value, precision: 'decade' };
  return { year: bce ? -value : value };
};

const yearFrom = (text: string): number | null => {
  const date = yearDateFrom(text);
  return date && !date.precision ? date.year : null;
};

/**
 * Reads a post's stored label back into a date: exact for labels this composer wrote,
 * best effort for older free-text ones ("1800s", "500 BC", "March 4, 1865"); null when undated.
 */
export const parseWallDate = (label: string | undefined): WallDate | null => {
  const text = (label ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*[:;,–-]$/, '');
  if (!text) return null;
  const numeric = NUMERIC.exec(text);
  if (numeric) {
    const [month, day, year] = [numeric[1], numeric[2], numeric[3]].map(Number);
    if (month < 1 || month > 12 || year < 100) return null;
    if (!day) return { year, month };
    return day >= 1 && day <= daysInMonth(year, month)
      ? { year, month, day }
      : null;
  }
  const about = ABOUT.exec(text);
  if (about) {
    const date = yearDateFrom(about[1]);
    if (!date) return null;
    // "Early 1800s" keeps its century; a plain year becomes approximate.
    return date.precision ? date : { year: date.year, precision: 'about' };
  }
  const century = CENTURY.exec(text);
  if (century) {
    const number = Number(century[1]);
    if (number < 1) return null;
    return { year: isBce(century[2]) ? -number : number, precision: 'century' };
  }
  const range = DECADE_RANGE.exec(text);
  if (range) {
    const start = Number(range[1]);
    // "1939-45" ends in 1945.
    const end =
      range[2].length < range[1].length
        ? Number(
            range[1].slice(0, range[1].length - range[2].length) + range[2]
          )
        : Number(range[2]);
    if (start % 10 === 0 && end === start + 9)
      return { year: start, precision: 'decade' };
    // Any other year range sits at its first year until spans arrive.
    return start >= 100 && end > start ? { year: start } : null;
  }
  const plain = yearDateFrom(text);
  if (plain) return plain;

  // Commas inside numbers ("12,000") stay; commas between words become spaces.
  const words = text
    .replace(/\b(\d{1,2})\s*[–-]\s*\d{1,2}\b/, '$1')
    .replace(/,(?!\d{3}\b)/g, ' ')
    .split(' ')
    .filter(Boolean);
  const monthAt = words.findIndex((w) =>
    MONTH_LOOKUP.has(w.toLowerCase().replace(/\.$/, ''))
  );
  if (monthAt === -1) return null;
  const month = MONTH_LOOKUP.get(
    words[monthAt].toLowerCase().replace(/\.$/, '')
  ) as number;
  const rest = words.filter((_, i) => i !== monthAt);
  // "April 14, 1865", "14 April 1865" or "June 44 BCE": a day only when what follows is still a year.
  if (rest.length > 1 && /^\d{1,2}$/.test(rest[0])) {
    const year = yearFrom(rest.slice(1).join(' '));
    const day = Number(rest[0]);
    if (year !== null)
      return day >= 1 && day <= daysInMonth(year, month)
        ? { year, month, day }
        : null;
  }
  const year = yearFrom(rest.join(' '));
  return year === null ? null : { year, month };
};

/** The stretch of years a decade or century covers, in axis units; null for a single date. */
export const wallDateSpan = (date: WallDate): [number, number] | null => {
  if (date.precision === 'decade') return [date.year, date.year + 10];
  if (date.precision === 'century') {
    const n = Math.abs(date.year);
    return date.year < 0
      ? [-n * 100, -(n - 1) * 100]
      : [(n - 1) * 100, n * 100];
  }
  return null;
};

/** Position on the axis in years; BCE counts back from zero so "500 BCE" sits on the 500 tick. */
export const dateSortKey = (date: WallDate): number => {
  const span = wallDateSpan(date);
  if (span) return (span[0] + span[1]) / 2;
  let key = date.year;
  if (date.month) {
    const days = daysInMonth(date.year, date.month);
    const within = date.day ? (date.day - 0.5) / days : 0;
    key += (date.month - 1 + within) / 12;
  }
  return key;
};
