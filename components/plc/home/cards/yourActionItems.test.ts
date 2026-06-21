import { describe, it, expect } from 'vitest';
import type { PlcTodo } from '@/types';
import { dueBucket, selectMyActionItems, startOfDay } from './yourActionItems';

const DAY = 24 * 60 * 60 * 1000;
// A fixed "now" at local noon so day-boundary math is unambiguous in tests.
const NOW = new Date(2026, 5, 18, 12, 0, 0).getTime();

function todo(over: Partial<PlcTodo> = {}): PlcTodo {
  return {
    id: 't1',
    text: 'Do the thing',
    done: false,
    createdBy: 'u1',
    createdAt: 1000,
    assigneeUid: 'me',
    ...over,
  };
}

describe('startOfDay', () => {
  it('zeroes the time-of-day for a timestamp', () => {
    const sod = startOfDay(NOW);
    expect(new Date(sod).getHours()).toBe(0);
    expect(sod).toBeLessThanOrEqual(NOW);
  });
});

describe('dueBucket', () => {
  it('returns none for null/undefined dueAt', () => {
    expect(dueBucket(null, NOW)).toBe('none');
    expect(dueBucket(undefined, NOW)).toBe('none');
  });

  it('returns overdue for a due date before today', () => {
    expect(dueBucket(NOW - 2 * DAY, NOW)).toBe('overdue');
  });

  it('returns today for a due date later the same day (day-granular)', () => {
    // 6 hours after noon is still "today", not overdue.
    expect(dueBucket(NOW + 6 * 60 * 60 * 1000, NOW)).toBe('today');
  });

  it('returns soon for a due date within the next 7 days', () => {
    expect(dueBucket(NOW + 3 * DAY, NOW)).toBe('soon');
  });

  it('returns later for a due date more than 7 days out', () => {
    expect(dueBucket(NOW + 30 * DAY, NOW)).toBe('later');
  });
});

describe('selectMyActionItems', () => {
  it('returns [] for a null uid', () => {
    expect(selectMyActionItems([todo()], null, NOW)).toEqual([]);
  });

  it('includes only the signed-in member’s open, live items', () => {
    const result = selectMyActionItems(
      [
        todo({ id: 'mine', assigneeUid: 'me' }),
        todo({ id: 'theirs', assigneeUid: 'other' }),
        todo({ id: 'done', assigneeUid: 'me', done: true }),
        todo({ id: 'deleted', assigneeUid: 'me', deletedAt: 999 }),
        todo({ id: 'unassigned', assigneeUid: null }),
      ],
      'me',
      NOW
    );
    expect(result.map((r) => r.todo.id)).toEqual(['mine']);
  });

  it('sorts dated items before undated ones', () => {
    const result = selectMyActionItems(
      [
        todo({ id: 'undated', dueAt: null, createdAt: 1 }),
        todo({ id: 'dated', dueAt: NOW + DAY, createdAt: 2 }),
      ],
      'me',
      NOW
    );
    expect(result.map((r) => r.todo.id)).toEqual(['dated', 'undated']);
  });

  it('sorts dated items soonest-due first (overdue floats to the top)', () => {
    const result = selectMyActionItems(
      [
        todo({ id: 'future', dueAt: NOW + 10 * DAY }),
        todo({ id: 'overdue', dueAt: NOW - 3 * DAY }),
        todo({ id: 'soon', dueAt: NOW + 1 * DAY }),
      ],
      'me',
      NOW
    );
    expect(result.map((r) => r.todo.id)).toEqual(['overdue', 'soon', 'future']);
  });

  it('breaks undated ties by creation time (oldest first)', () => {
    const result = selectMyActionItems(
      [
        todo({ id: 'newer', dueAt: null, createdAt: 200 }),
        todo({ id: 'older', dueAt: null, createdAt: 100 }),
      ],
      'me',
      NOW
    );
    expect(result.map((r) => r.todo.id)).toEqual(['older', 'newer']);
  });

  it('attaches the derived due bucket to each row', () => {
    const result = selectMyActionItems(
      [todo({ id: 'overdue', dueAt: NOW - DAY })],
      'me',
      NOW
    );
    expect(result[0].bucket).toBe('overdue');
  });
});
