import { describe, it, expect } from 'vitest';
import { formatGradeLevelsLabel } from './constants';

describe('formatGradeLevelsLabel', () => {
  it('orders a partial grade-band selection by canonical grade order, not string order', () => {
    // Selecting these three (in this click order) previously produced
    // "3-5, 6-8, 9-12" via a plain `.sort()` (digits < 'K' in ASCII) once a
    // 4th band like 'k-2' was mixed in — reproduced directly below.
    expect(formatGradeLevelsLabel(['9-12', 'k-2', '3-5'])).toBe(
      'K-2, 3-5, 9-12'
    );
  });

  it('sorts K-2 before numeric bands even though "K" > digits lexicographically', () => {
    expect(formatGradeLevelsLabel(['6-8', '3-5', 'k-2'])).toBe('K-2, 3-5, 6-8');
  });

  it('returns "None" for an empty selection', () => {
    expect(formatGradeLevelsLabel([])).toBe('None');
  });

  it('returns "Universal" when every grade band is selected', () => {
    expect(formatGradeLevelsLabel(['k-2', '3-5', '6-8', '9-12'])).toBe(
      'Universal'
    );
  });

  it('returns a single uppercased label for one selected band', () => {
    expect(formatGradeLevelsLabel(['3-5'])).toBe('3-5');
  });
});
