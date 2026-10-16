import { describe, it, expect } from 'vitest';
import { ON_TIME_CUSHION_MS } from '@/utils/gradebook/gradebookCore';
import { daysLate } from '@/components/gradebook/popovers/popoverFormat';

describe('daysLate', () => {
  const due = 1_000_000_000;

  it('is 0 for work inside the one-minute cushion', () => {
    expect(daysLate(due + 30_000, due)).toBe(0);
    expect(daysLate(due + ON_TIME_CUSHION_MS, due)).toBe(0);
  });

  it('counts a day once past the cushion', () => {
    expect(daysLate(due + ON_TIME_CUSHION_MS + 1, due)).toBe(1);
    expect(daysLate(due + 86_400_000 + 5 * 60_000, due)).toBe(2);
  });

  it('is 0 for early work', () => {
    expect(daysLate(due - 1000, due)).toBe(0);
  });
});
