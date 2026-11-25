import { describe, it, expect } from 'vitest';
import { mmSsToSeconds as parse, secondsToMmSs } from '@/utils/videoTimestamp';

describe('mmSsToSeconds', () => {
  it('parses valid MM:SS', () => {
    expect(parse('01:30')).toBe(90);
    expect(parse('0:5')).toBe(5);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parse(' 1:30 ')).toBe(90);
    expect(parse('1: 30')).toBe(90);
    expect(parse('1 : 30')).toBe(90);
  });

  it('rejects negative parts instead of producing a shifted time', () => {
    expect(parse('1:-30')).toBeNaN();
    expect(parse('-1:30')).toBeNaN();
  });

  it('rejects 60 seconds, extra parts and blanks', () => {
    expect(parse('01:60')).toBeNaN();
    expect(parse('1:2:3')).toBeNaN();
    expect(parse('')).toBeNaN();
  });

  it('rejects trailing junk and decimals', () => {
    expect(parse('12abc:30')).toBeNaN();
    expect(parse('1.5:30')).toBeNaN();
    expect(parse('1:30s')).toBeNaN();
  });
});

describe('secondsToMmSs', () => {
  it('pads minutes and seconds to two digits', () => {
    expect(secondsToMmSs(90)).toBe('01:30');
    expect(secondsToMmSs(0)).toBe('00:00');
    expect(secondsToMmSs(605)).toBe('10:05');
  });

  it('clamps negative values to 00:00', () => {
    expect(secondsToMmSs(-10)).toBe('00:00');
  });
});
