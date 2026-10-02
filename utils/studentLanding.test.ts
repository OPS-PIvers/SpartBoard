import { describe, expect, it } from 'vitest';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { TurnInMap } from '@/hooks/useStudentTurnIns';
import {
  classListLine,
  landingRowState,
  partitionLanding,
  periodLabel,
  periodSquare,
  upNextRows,
} from './studentLanding';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 2, 15, 40).getTime();

const a = (over: Partial<AssignmentSummary>): AssignmentSummary => ({
  compositeId: `quiz:${over.sessionId ?? 'x'}`,
  kind: 'quiz',
  sessionId: 'x',
  title: 'T',
  openHref: '#',
  channel: 'active',
  classIds: ['c1'],
  gradingState: 'not-graded',
  workKind: 'work',
  ...over,
});

const checked = (
  row: AssignmentSummary,
  turnIn: 'turned-in' | 'in-progress' | 'not-started'
): TurnInMap => ({
  [row.compositeId]: { turnIn, lockedOut: false, resultsOverride: null },
});

describe('landingRowState', () => {
  it('counts only a real submission as turned in', () => {
    const row = a({});
    expect(landingRowState(row, checked(row, 'turned-in'), NOW)).toBe(
      'turned-in'
    );
    expect(landingRowState(row, checked(row, 'in-progress'), NOW)).toBe(
      'in-progress'
    );
    expect(landingRowState(row, {}, NOW)).toBe('open');
  });

  it('marks past-due open work as missing still open, never before its check', () => {
    const row = a({ dueAt: NOW - DAY, closeAt: NOW + DAY });
    expect(landingRowState(row, {}, NOW)).toBe('open');
    expect(landingRowState(row, checked(row, 'not-started'), NOW)).toBe(
      'missing-open'
    );
  });

  it('moves closed, unsubmitted work with a due date to missing and drops it without one', () => {
    const due = a({
      channel: 'ended',
      endedAt: NOW - DAY,
      dueAt: NOW - 2 * DAY,
    });
    expect(landingRowState(due, checked(due, 'not-started'), NOW)).toBe(
      'missing'
    );
    const noDue = a({ channel: 'ended', endedAt: NOW - DAY });
    expect(
      landingRowState(noDue, checked(noDue, 'not-started'), NOW)
    ).toBeNull();
    expect(landingRowState(due, {}, NOW)).toBeNull();
  });

  it('hides a resource once it closes', () => {
    expect(landingRowState(a({ workKind: 'resource' }), {}, NOW)).toBe(
      'resource'
    );
    expect(
      landingRowState(a({ workKind: 'resource', closeAt: NOW - 1 }), {}, NOW)
    ).toBeNull();
  });

  it('shows a live session as live and an unopened window as upcoming', () => {
    expect(landingRowState(a({ live: true }), {}, NOW)).toBe('live');
    expect(landingRowState(a({ openAt: NOW + DAY }), {}, NOW)).toBe('upcoming');
  });
});

describe('partitionLanding', () => {
  it('sorts Missing still open first, then by due date, then no due date', () => {
    const later = a({ sessionId: 'later', dueAt: NOW + 3 * DAY });
    const none = a({ sessionId: 'none' });
    const soon = a({ sessionId: 'soon', dueAt: NOW + DAY });
    const missing = a({ sessionId: 'missing', dueAt: NOW - DAY });
    const p = partitionLanding(
      [later, none, soon, missing],
      checked(missing, 'not-started'),
      NOW
    );
    expect(p.work.map((r) => r.assignment.sessionId)).toEqual([
      'missing',
      'soon',
      'later',
      'none',
    ]);
  });

  it('puts closed Missing ahead of finished work, newest first', () => {
    const old = a({ sessionId: 'old', dueAt: NOW - 9 * DAY });
    const recent = a({ sessionId: 'recent', dueAt: NOW - 2 * DAY });
    const gone = a({
      sessionId: 'gone',
      channel: 'ended',
      endedAt: NOW - DAY,
      dueAt: NOW - 20 * DAY,
    });
    const p = partitionLanding(
      [old, recent, gone],
      {
        ...checked(old, 'turned-in'),
        ...checked(recent, 'turned-in'),
        ...checked(gone, 'not-started'),
      },
      NOW
    );
    expect(p.done.map((r) => r.assignment.sessionId)).toEqual([
      'gone',
      'recent',
      'old',
    ]);
  });
});

describe('upNextRows', () => {
  it('always keeps Missing and due today, then three more', () => {
    const work = [0, 1, 2, 3, 4, 5].map((i) => ({
      assignment: a({ sessionId: `w${i}`, dueAt: NOW + i * DAY + 60_000 }),
      state: 'open' as const,
    }));
    const { shown, total } = upNextRows(work, NOW);
    expect(total).toBe(6);
    expect(shown.map((r) => r.assignment.sessionId)).toEqual([
      'w0',
      'w1',
      'w2',
      'w3',
    ]);
  });
});

describe('classListLine', () => {
  const missing = {
    assignment: a({ dueAt: NOW - DAY }),
    state: 'missing-open' as const,
  };
  const soon = { assignment: a({ dueAt: NOW + DAY }), state: 'open' as const };
  it('prefers in class now, then Missing, then due this week, then teachers', () => {
    expect(classListLine([missing], true, 'Ms. A', NOW).text).toBe(
      'In class now'
    );
    expect(classListLine([missing, soon], false, 'Ms. A', NOW).text).toBe(
      'Missing: 1'
    );
    expect(classListLine([soon], false, 'Ms. A', NOW).text).toBe(
      '1 due this week'
    );
    expect(classListLine([], false, 'Ms. A', NOW).text).toBe('Ms. A');
  });
});

describe('period helpers', () => {
  it('puts the period number in the square, else the first letter', () => {
    expect(periodSquare('Biology', { buildingId: 'b', periodId: 'P3' })).toBe(
      '3'
    );
    expect(periodSquare('Biology', { buildingId: 'b', periodId: '5a' })).toBe(
      '5A'
    );
    expect(periodSquare('biology')).toBe('B');
  });

  it('names the period from the schedule, with a plain fallback', () => {
    expect(periodLabel(undefined, () => null)).toBeUndefined();
    expect(periodLabel({ buildingId: 'b', periodId: '3' }, () => null)).toBe(
      'Period 3'
    );
  });
});
