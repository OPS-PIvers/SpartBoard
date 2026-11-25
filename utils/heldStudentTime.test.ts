import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ db: {} }));

import { nextHold } from '@/utils/heldStudentTime';

describe('nextHold', () => {
  const hold = {
    until: 500,
    students: {
      a: { from: 100, until: 500 },
      b: { from: null, until: 300 },
    },
  };

  it('an edit moves the hold to the latest end', () => {
    expect(nextHold(hold, 'b', { from: 600, until: 900 }, 50)).toEqual({
      until: 900,
      students: { a: { from: 100, until: 500 }, b: { from: 600, until: 900 } },
    });
  });

  it('a removal drops the student and recomputes the end', () => {
    expect(nextHold(hold, 'a', null, 50)).toEqual({
      until: 300,
      students: { b: { from: null, until: 300 } },
    });
  });

  it('removing the last student ends the hold now so the sweep ends the quiz', () => {
    expect(
      nextHold(
        { until: 5, students: { a: { from: null, until: 5 } } },
        'a',
        null,
        42
      )
    ).toEqual({
      until: 42,
      students: {},
    });
  });
});
