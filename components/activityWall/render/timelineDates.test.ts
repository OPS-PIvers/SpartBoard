import { describe, expect, it } from 'vitest';
import {
  dateSortKey,
  fieldsFromDate,
  formatWallDate,
  parseWallDate,
  validateDateFields,
  type WallDate,
} from './timelineDates';

describe('timeline dates', () => {
  it('round-trips every shape the composer writes', () => {
    const dates: WallDate[] = [
      { year: 1865 },
      { year: 1865, month: 4 },
      { year: 1865, month: 4, day: 14 },
      { year: -44, month: 3, day: 15 },
      { year: -12000 },
      { year: 1 },
      { year: 79, month: 8 },
      { year: -44, month: 6 },
      { year: -1, month: 1 },
      { year: -10000, month: 2 },
      { year: -10000, month: 6, day: 1 },
      { year: 1450, precision: 'about' },
      { year: -44, precision: 'about' },
      { year: 1990, precision: 'decade' },
      { year: 1900, precision: 'decade' },
      { year: 470, precision: 'decade' },
      { year: 19, precision: 'century' },
      { year: 1, precision: 'century' },
      { year: -5, precision: 'century' },
      { year: -11, precision: 'century' },
    ];
    for (const date of dates) {
      expect(parseWallDate(formatWallDate(date))).toEqual(date);
    }
  });

  it('formats as students read dates', () => {
    expect(formatWallDate({ year: 1944, month: 6, day: 6 })).toBe(
      'June 6, 1944'
    );
    expect(formatWallDate({ year: -500 })).toBe('500 BCE');
    expect(formatWallDate({ year: -12000 })).toBe('12,000 BCE');
    expect(formatWallDate({ year: 79 })).toBe('79 CE');
  });

  it('reads older free-text labels where it can', () => {
    expect(parseWallDate('1956')).toEqual({ year: 1956 });
    expect(parseWallDate('1800s')).toEqual({ year: 19, precision: 'century' });
    expect(parseWallDate('500 BC')).toEqual({ year: -500 });
    expect(parseWallDate('c. 1450')).toEqual({
      year: 1450,
      precision: 'about',
    });
    expect(parseWallDate('5th century BC')).toEqual({
      year: -5,
      precision: 'century',
    });
    expect(parseWallDate('AD 79')).toEqual({ year: 79 });
    expect(parseWallDate('March 4, 1865')).toEqual({
      year: 1865,
      month: 3,
      day: 4,
    });
    expect(parseWallDate('4 March 1865')).toEqual({
      year: 1865,
      month: 3,
      day: 4,
    });
    expect(parseWallDate('Early 1800s')).toBeNull();
    expect(parseWallDate('May 5')).toBeNull();
    expect(parseWallDate('7')).toBeNull();
    expect(parseWallDate('1990s')).toEqual({ year: 1990, precision: 'decade' });
    expect(parseWallDate('Civil War')).toBeNull();
    expect(parseWallDate('Before the war')).toBeNull();
    expect(parseWallDate('February 30, 1900')).toBeNull();
    expect(parseWallDate(undefined)).toBeNull();
  });

  it('places the ways students write dates in a timeline assignment', () => {
    const cases: [string, string][] = [
      ['1851:', '1851'],
      ['Aug. 17, 1862', 'August 17, 1862'],
      ['Sept 23, 1862', 'September 23, 1862'],
      ['12/26/1862', 'December 26, 1862'],
      ['8/1862', 'August 1862'],
      ['1862-1863', '1862'],
      ['Summer 1862', 'c. 1862'],
      ['circa 1862', 'c. 1862'],
      ['~1862', 'c. 1862'],
      ['Aug 18-22, 1862', 'August 18, 1862'],
    ];
    for (const [label, formatted] of cases) {
      const date = parseWallDate(label);
      expect(date && formatWallDate(date)).toBe(formatted);
    }
    expect(parseWallDate('13/1/1862')).toBeNull();
  });

  it('validates the composer fields', () => {
    const base = {
      year: '',
      era: 'CE' as const,
      month: '',
      day: '',
      precision: 'exact' as const,
    };
    expect(validateDateFields(base)).toEqual({ error: 'Enter a year.' });
    expect(validateDateFields({ ...base, year: '19a4' })).toEqual({
      error: 'Use numbers only for the year.',
    });
    expect(validateDateFields({ ...base, year: '10000' })).toEqual({
      error: 'Enter a year from 1 to 9,999.',
    });
    expect(validateDateFields({ ...base, year: '0' })).toHaveProperty('error');
    expect(
      validateDateFields({ ...base, year: '1900', month: '2', day: '29' })
    ).toEqual({ error: "February doesn't have 29 days." });
    expect(
      validateDateFields({ ...base, year: '2000', month: '2', day: '29' })
    ).toEqual({ date: { year: 2000, month: 2, day: 29 } });
    expect(
      validateDateFields({ ...base, year: '44', era: 'BCE', month: '3' })
    ).toEqual({ date: { year: -44, month: 3 } });
    expect(fieldsFromDate({ year: -44, month: 3 })).toEqual({
      year: '44',
      era: 'BCE',
      month: '3',
      day: '',
      precision: 'exact',
    });
    expect(
      validateDateFields({ ...base, year: '1994', precision: 'decade' })
    ).toEqual({ date: { year: 1990, precision: 'decade' } });
    expect(
      validateDateFields({ ...base, year: '1850', precision: 'century' })
    ).toEqual({ date: { year: 19, precision: 'century' } });
    expect(
      validateDateFields({
        ...base,
        year: '450',
        era: 'BCE',
        precision: 'century',
      })
    ).toEqual({ date: { year: -5, precision: 'century' } });
    // A century edits as its middle year and saves back to the same century.
    for (const date of [
      { year: 19, precision: 'century' as const },
      { year: -5, precision: 'century' as const },
      { year: 1, precision: 'century' as const },
    ]) {
      expect(validateDateFields(fieldsFromDate(date))).toEqual({ date });
    }
  });

  it('sorts chronologically across eras and within a year', () => {
    const keys = [
      { year: -6, precision: 'century' as const },
      { year: -500 },
      { year: -44, month: 3, day: 15 },
      { year: 1776, month: 7, day: 4 },
      { year: 1776, month: 12 },
      { year: 1777 },
    ].map(dateSortKey);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
  });
});
