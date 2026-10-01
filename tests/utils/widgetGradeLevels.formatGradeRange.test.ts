import { describe, it, expect } from 'vitest';
import { formatGradeRange } from '@/config/widgetGradeLevels';

describe('formatGradeRange', () => {
  it('spans contiguous bands', () => {
    expect(formatGradeRange(['k-2', '3-5'])).toBe('K-5');
    expect(formatGradeRange(['3-5', 'k-2', '6-8'])).toBe('K-8');
  });

  it('labels a single band and all bands', () => {
    expect(formatGradeRange(['6-8'])).toBe('6-8');
    expect(formatGradeRange(['k-2', '3-5', '6-8', '9-12'])).toBe('K-12');
  });

  it('lists separate spans when bands are not contiguous', () => {
    expect(formatGradeRange(['k-2', '9-12'])).toBe('K-2, 9-12');
  });

  it('returns an empty label for no bands', () => {
    expect(formatGradeRange([])).toBe('');
  });
});
