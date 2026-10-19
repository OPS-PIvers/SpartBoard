import { describe, expect, it } from 'vitest';
import { sheetsFromWork } from './scoredWorkPlan';

describe('sheetsFromWork', () => {
  it('rebuilds students in seat order with blank spares', () => {
    const sheets = sheetsFromWork(
      {
        seats: {
          2: { rosterId: 'r', studentId: 'b' },
          1: { rosterId: 'r', studentId: 'a' },
        },
        spareSeats: [3],
      },
      (seat) =>
        seat.studentId === 'a' ? { name: 'Lee, Ann', className: 'P1' } : null
    );
    expect(sheets.map((s) => [s.seat, s.displayName])).toEqual([
      [1, 'Lee, Ann'],
      [2, 'Unnamed student'],
      [3, 'Name ______________________'],
    ]);
    expect(sheets[2].student).toBeNull();
  });
});
