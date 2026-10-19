import { describe, expect, it } from 'vitest';
import { seatDisplayName } from './scoredWorkNames';

const rosters = [
  {
    id: 'r1',
    name: 'Period 1',
    students: [{ id: 's1', firstName: 'Ann', lastName: 'Lee', pin: '01' }],
  },
];

describe('seatDisplayName', () => {
  it('resolves a seat through the roster', () => {
    expect(
      seatDisplayName(rosters, { rosterId: 'r1', studentId: 's1' })
    ).toEqual({
      name: 'Lee, Ann',
      className: 'Period 1',
    });
  });

  it('returns null for spares and removed students', () => {
    expect(seatDisplayName(rosters, undefined)).toBeNull();
    expect(
      seatDisplayName(rosters, { rosterId: 'r1', studentId: 'gone' })
    ).toBeNull();
    expect(
      seatDisplayName(rosters, { rosterId: 'x', studentId: 's1' })
    ).toBeNull();
  });
});
