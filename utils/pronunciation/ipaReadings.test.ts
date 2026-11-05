import { describe, expect, it } from 'vitest';
import { filledIpaReadings, ipaReadingsOf, ipaValueOf } from './ipaReadings';

describe('ipaReadings', () => {
  it('reads one saved reading or several', () => {
    expect(ipaReadingsOf('a')).toEqual(['a']);
    expect(ipaReadingsOf('a|')).toEqual(['a', '']);
    expect(ipaReadingsOf(undefined)).toEqual([]);
  });

  it('keeps only filled, trimmed readings', () => {
    expect(filledIpaReadings(' a | |b')).toEqual(['a', 'b']);
  });

  it('stores one reading as itself, so older cards keep their value', () => {
    expect(ipaValueOf([])).toBeUndefined();
    expect(ipaValueOf(['a'])).toBe('a');
    expect(ipaValueOf(['a', 'b'])).toBe('a|b');
  });
});
