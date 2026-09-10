import { describe, it, expect } from 'vitest';
import type { PlcActionItem, PlcNote } from '@/types';
import { dueBucket, selectMyActionItems, startOfDay } from './yourActionItems';

const DAY = 24 * 60 * 60 * 1000;
// A fixed "now" at local noon so day-boundary math is unambiguous in tests.
const NOW = new Date(2026, 5, 18, 12, 0, 0).getTime();

function item(over: Partial<PlcActionItem> = {}): PlcActionItem {
  return {
    id: 'i1',
    text: 'Do the thing',
    done: false,
    createdBy: 'u1',
    createdAt: 1000,
    assigneeUid: 'me',
    ...over,
  };
}

function note(items: PlcActionItem[], over: Partial<PlcNote> = {}): PlcNote {
  return {
    id: over.id ?? 'n1',
    title: 'Note',
    body: '',
    createdBy: 'u1',
    createdAt: 0,
    lastEditedBy: 'u1',
    lastEditedAt: 0,
    actionItems: items,
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
    expect(selectMyActionItems([note([item()])], null, NOW)).toEqual([]);
  });

  it('includes only the signed-in member’s open items on live notes', () => {
    const result = selectMyActionItems(
      [
        note([item({ id: 'mine', assigneeUid: 'me' })]),
        note([item({ id: 'theirs', assigneeUid: 'other' })]),
        note([item({ id: 'done', assigneeUid: 'me', done: true })]),
        note([item({ id: 'deleted-note', assigneeUid: 'me' })], {
          id: 'n-deleted',
          deletedAt: 999,
        }),
        note([item({ id: 'unassigned', assigneeUid: null })]),
      ],
      'me',
      NOW
    );
    expect(result.map((r) => r.item.id)).toEqual(['mine']);
  });

  it('sorts dated items before undated ones', () => {
    const result = selectMyActionItems(
      [
        note([item({ id: 'undated', dueAt: null, createdAt: 1 })]),
        note([item({ id: 'dated', dueAt: NOW + DAY, createdAt: 2 })]),
      ],
      'me',
      NOW
    );
    expect(result.map((r) => r.item.id)).toEqual(['dated', 'undated']);
  });

  it('sorts dated items soonest-due first (overdue floats to the top)', () => {
    const result = selectMyActionItems(
      [
        note([item({ id: 'future', dueAt: NOW + 10 * DAY })]),
        note([item({ id: 'overdue', dueAt: NOW - 3 * DAY })]),
        note([item({ id: 'soon', dueAt: NOW + 1 * DAY })]),
      ],
      'me',
      NOW
    );
    expect(result.map((r) => r.item.id)).toEqual(['overdue', 'soon', 'future']);
  });

  it('breaks undated ties by creation time (oldest first)', () => {
    const result = selectMyActionItems(
      [
        note([item({ id: 'newer', dueAt: null, createdAt: 200 })]),
        note([item({ id: 'older', dueAt: null, createdAt: 100 })]),
      ],
      'me',
      NOW
    );
    expect(result.map((r) => r.item.id)).toEqual(['older', 'newer']);
  });

  it('attaches the derived due bucket to each row', () => {
    const result = selectMyActionItems(
      [note([item({ id: 'overdue', dueAt: NOW - DAY })])],
      'me',
      NOW
    );
    expect(result[0].bucket).toBe('overdue');
  });
});
