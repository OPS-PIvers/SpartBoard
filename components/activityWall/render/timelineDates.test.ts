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
  });

  it('reads older free-text labels where it can', () => {
    expect(parseWallDate('1956')).toEqual({ year: 1956 });
    expect(parseWallDate('1800s')).toEqual({ year: 1800 });
    expect(parseWallDate('500 BC')).toEqual({ year: -500 });
    expect(parseWallDate('c. 1450')).toEqual({ year: 1450 });
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
    expect(parseWallDate('Before the war')).toBeNull();
    expect(parseWallDate('February 30, 1900')).toBeNull();
    expect(parseWallDate(undefined)).toBeNull();
  });

  it('validates the composer fields', () => {
    const base = { year: '', era: 'CE' as const, month: '', day: '' };
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
    });
  });

  it('sorts chronologically across eras and within a year', () => {
    const keys = [
      { year: -500 },
      { year: -44, month: 3, day: 15 },
      { year: 1776, month: 7, day: 4 },
      { year: 1776, month: 12 },
      { year: 1777 },
    ].map(dateSortKey);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
  });
});
