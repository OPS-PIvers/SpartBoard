import { describe, expect, it } from 'vitest';
import { paperCopySeatKeys } from '@/utils/paperCopySeats';

describe('paperCopySeatKeys', () => {
  it('collects every seated student across printed stacks', () => {
    const keys = paperCopySeatKeys([
      {
        seats: {
          1: { rosterId: 'r1', studentId: 'a' },
          2: { rosterId: 'r1', studentId: 'b' },
        },
      },
      { seats: { 1: { rosterId: 'r2', studentId: 'a' } } },
    ]);
    expect([...keys].sort()).toEqual(['r1:a', 'r1:b', 'r2:a']);
  });

  it('skips a stack with no seats', () => {
    expect(paperCopySeatKeys([{ seats: {} }]).size).toBe(0);
  });
});
