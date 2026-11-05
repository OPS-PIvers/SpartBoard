import { describe, expect, it } from 'vitest';
import { filledIpaReadings, ipaReadingsOf, ipaValueOf } from './ipaReadings';

describe('ipaReadings', () => {
  it('reads one saved reading or several', () => {
    expect(ipaReadingsOf('a')).toEqual(['a']);
    expect(ipaReadingsOf(['a', ''])).toEqual(['a', '']);
    expect(ipaReadingsOf(undefined)).toEqual([]);
    expect(ipaReadingsOf([1, 'b'])).toEqual(['b']);
  });

  it('keeps only filled, trimmed readings', () => {
    expect(filledIpaReadings([' a ', ' ', 'b'])).toEqual(['a', 'b']);
  });

  it('saves one reading as a string so older cards keep their shape', () => {
    expect(ipaValueOf([])).toBeUndefined();
    expect(ipaValueOf(['a'])).toBe('a');
    expect(ipaValueOf(['a', 'b'])).toEqual(['a', 'b']);
  });
});
