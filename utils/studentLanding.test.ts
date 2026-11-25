import { describe, expect, it } from 'vitest';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { TurnInMap } from '@/hooks/useStudentTurnIns';
import type { StudentGradeRow } from '@/utils/gradebook/studentGrades';
import {
  classListLine,
  completedItems,
  gradebookItems,
  landingRowState,
  partitionLanding,
  periodLabel,
  periodSquare,
  upNextRows,
  withLandingPass,
  workAvailability,
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

  it('keeps a teacher-reopened quiz open after its close time, not after End', () => {
    const row = a({ dueAt: NOW - 2 * DAY, closeAt: NOW - DAY });
    const reopened: TurnInMap = {
      [row.compositeId]: {
        turnIn: 'in-progress',
        reopened: true,
        lockedOut: false,
        resultsOverride: null,
      },
    };
    expect(landingRowState(row, reopened, NOW)).toBe('in-progress');
    const ended = a({ dueAt: NOW - 2 * DAY, endedAt: NOW - DAY });
    expect(
      landingRowState(
        ended,
        { [ended.compositeId]: reopened[row.compositeId] },
        NOW
      )
    ).toBe('missing');
  });

  it('never marks a printed copy Missing before its scan', () => {
    const open = a({
      dueAt: NOW - DAY,
      closeAt: NOW + DAY,
      override: { onPaper: true },
    });
    expect(landingRowState(open, checked(open, 'not-started'), NOW)).toBe(
      'open'
    );
    const closed = a({
      dueAt: NOW - 2 * DAY,
      endedAt: NOW - DAY,
      override: { onPaper: true },
    });
    expect(landingRowState(closed, checked(closed, 'not-started'), NOW)).toBe(
      null
    );
    expect(landingRowState(closed, checked(closed, 'turned-in'), NOW)).toBe(
      'turned-in'
    );
    // A device attempt left unsubmitted still shows as closed.
    expect(landingRowState(closed, checked(closed, 'in-progress'), NOW)).toBe(
      'closed'
    );
  });

  it('marks past-due open work as missing still open, never before its check', () => {
    const row = a({ dueAt: NOW - DAY, closeAt: NOW + DAY });
    expect(landingRowState(row, {}, NOW)).toBe('open');
    expect(landingRowState(row, checked(row, 'not-started'), NOW)).toBe(
      'missing-open'
    );
  });

  it('never marks a paused or not-yet-open quiz missing', () => {
    for (const held of ['paused', 'not-open'] as const) {
      const row = a({ dueAt: NOW - DAY, held });
      expect(landingRowState(row, checked(row, 'not-started'), NOW)).toBe(
        'open'
      );
    }
  });

  it('never marks a run outside the student classes missing or live, and locks it', () => {
    const row = a({ dueAt: NOW - DAY, outsideClasses: true, live: true });
    const state = landingRowState(row, checked(row, 'not-started'), NOW);
    expect(state).toBe('open');
    expect(
      workAvailability({ assignment: row, state: 'open' }, NOW, 'u1')
    ).toBe('locked');
  });

  it('moves closed, unsubmitted work with a due date to missing and drops it without one', () => {
    const started = a({ channel: 'ended', endedAt: NOW - DAY });
    expect(landingRowState(started, checked(started, 'in-progress'), NOW)).toBe(
      'missing'
    );
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

describe('landingRowState for projects', () => {
  const project = (over: Partial<AssignmentSummary> = {}) =>
    a({
      kind: 'projects',
      compositeId: 'projects:r1',
      sessionId: 'r1',
      acceptingResponses: true,
      ...over,
    });

  it('keeps a closed run without submissions under Completed as before', () => {
    const row = project({ acceptingResponses: false });
    expect(landingRowState(row, {}, NOW)).toBe('turned-in');
  });

  it('moves a submitted group to Completed while the run stays open', () => {
    const row = project({ studentSubmit: true });
    expect(landingRowState(row, checked(row, 'turned-in'), NOW)).toBe(
      'turned-in'
    );
    expect(landingRowState(row, checked(row, 'in-progress'), NOW)).toBe(
      'in-progress'
    );
  });

  it('never marks a student in no group Missing', () => {
    const open = project({ studentSubmit: true, dueAt: NOW - DAY });
    expect(landingRowState(open, checked(open, 'not-started'), NOW)).toBe(
      'open'
    );
    const closed = project({
      studentSubmit: true,
      dueAt: NOW - DAY,
      acceptingResponses: false,
    });
    expect(landingRowState(closed, checked(closed, 'not-started'), NOW)).toBe(
      'turned-in'
    );
  });

  it('shows Missing past due, open or closed', () => {
    const open = project({ studentSubmit: true, dueAt: NOW - DAY });
    expect(landingRowState(open, checked(open, 'in-progress'), NOW)).toBe(
      'missing-open'
    );
    const closed = project({
      studentSubmit: true,
      dueAt: NOW - DAY,
      acceptingResponses: false,
    });
    expect(landingRowState(closed, checked(closed, 'in-progress'), NOW)).toBe(
      'missing'
    );
    expect(landingRowState(closed, checked(closed, 'turned-in'), NOW)).toBe(
      'turned-in'
    );
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

  it('puts open work above paused, not-open-yet and locked work, even with no due date', () => {
    const access = (state: 'open' | 'paused' | 'closed') => ({
      state,
      openAt: null,
      closeAt: null,
      bellPeriodId: null,
      verified: true,
      label: 'P1',
    });
    const gate = (state: 'open' | 'paused' | 'closed') => ({
      accessMode: 'assessment' as const,
      periodAccess: { p1: access(state) },
      periodKeys: ['p1'],
    });
    const notOpen = a({ sessionId: 'not-open', held: 'not-open' });
    const paused = a({ sessionId: 'paused', dueAt: NOW + DAY, held: 'paused' });
    const classPaused = a({
      sessionId: 'class-paused',
      periodGate: gate('paused'),
    });
    const upcoming = a({ sessionId: 'upcoming', openAt: NOW + DAY });
    const live = a({ sessionId: 'live', periodGate: gate('open') });
    const open = a({ sessionId: 'open', dueAt: NOW + 2 * DAY });
    const p = partitionLanding(
      [notOpen, paused, classPaused, upcoming, open, live],
      {},
      NOW,
      'stu'
    );
    expect(p.work.map((r) => r.assignment.sessionId)).toEqual([
      'live',
      'open',
      'paused',
      'not-open',
      'class-paused',
      'upcoming',
    ]);
    expect(p.work.map((r) => workAvailability(r, NOW, 'stu'))).toEqual([
      'live',
      'open',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
  });

  it('moves closed work never turned in to Expired, out of Completed', () => {
    const old = a({ sessionId: 'old', dueAt: NOW - 9 * DAY });
    const recent = a({ sessionId: 'recent', dueAt: NOW - 2 * DAY });
    const gone = a({
      sessionId: 'gone',
      channel: 'ended',
      endedAt: NOW - DAY,
      dueAt: NOW - 20 * DAY,
    });
    const started = a({
      sessionId: 'started',
      channel: 'ended',
      endedAt: NOW - 3 * DAY,
    });
    const late = a({
      sessionId: 'late',
      dueAt: NOW - DAY,
      closeAt: NOW + DAY,
    });
    const p = partitionLanding(
      [old, recent, gone, started, late],
      {
        ...checked(old, 'turned-in'),
        ...checked(recent, 'turned-in'),
        ...checked(gone, 'not-started'),
        ...checked(started, 'in-progress'),
        ...checked(late, 'not-started'),
      },
      NOW
    );
    expect(p.done.map((r) => r.assignment.sessionId)).toEqual([
      'recent',
      'old',
    ]);
    expect(p.expired.map((r) => r.assignment.sessionId)).toEqual([
      'started',
      'gone',
    ]);
    expect(p.work.map((r) => r.assignment.sessionId)).toEqual(['late']);
  });

  it('keeps a printed copy waiting for its scan in Completed', () => {
    const paper = a({
      sessionId: 'paper',
      dueAt: NOW - 2 * DAY,
      endedAt: NOW - DAY,
      override: { onPaper: true },
    });
    const p = partitionLanding([paper], checked(paper, 'in-progress'), NOW);
    expect(p.done.map((r) => r.state)).toEqual(['closed']);
    expect(p.expired).toEqual([]);
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
  it('keeps the list order, so a locked row due today stays below open ones', () => {
    const locked = {
      assignment: a({
        sessionId: 'locked',
        dueAt: NOW + 60_000,
        held: 'paused',
      }),
      state: 'open' as const,
    };
    const open = [1, 2, 3, 4].map((i) => ({
      assignment: a({ sessionId: `o${i}`, dueAt: NOW + i * DAY }),
      state: 'open' as const,
    }));
    const { shown } = upNextRows([...open, locked], NOW);
    expect(shown.map((r) => r.assignment.sessionId)).toEqual([
      'o1',
      'o2',
      'o3',
      'locked',
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

describe('gradebookItems', () => {
  const grade = (
    sessionId: string,
    over: Partial<StudentGradeRow> = {}
  ): StudentGradeRow => ({
    sessionId,
    kind: 'quiz',
    title: `G ${sessionId}`,
    dueAt: null,
    status: 'scored',
    points: 8,
    max: 10,
    pct: 80,
    flags: [],
    comment: null,
    updatedAt: 0,
    ...over,
  });

  it('joins grades to done rows, adds graded sessions that left the list, and skips open work', () => {
    const done = a({ sessionId: 'd', channel: 'ended', dueAt: NOW - DAY });
    const open = a({ sessionId: 'o', dueAt: NOW + DAY });
    const p = partitionLanding(
      [done, open],
      { ...checked(done, 'turned-in'), ...checked(open, 'not-started') },
      NOW
    );
    const items = gradebookItems(p, [
      grade('d'),
      grade('o', {
        flags: [{ id: 'missing', name: 'Missing', key: 'M', color: 'rose' }],
      }),
      grade('gone', { kind: 'video-activity', dueAt: NOW - 3 * DAY }),
    ]);
    expect(items.map((i) => i.sessionId)).toEqual(['d', 'gone']);
    expect(items[0].grade?.sessionId).toBe('d');
    expect(items[0].row?.assignment.sessionId).toBe('d');
    expect(items[1].row).toBeUndefined();
    expect(items[1].kind).toBe('video-activity');
  });

  it('puts Missing first, from the row or from a grade-only Missing flag, then newest first', () => {
    const older = a({
      sessionId: 'old',
      channel: 'ended',
      dueAt: NOW - 5 * DAY,
    });
    const newer = a({ sessionId: 'new', channel: 'ended', dueAt: NOW - DAY });
    const p = partitionLanding(
      [older, newer],
      { ...checked(older, 'turned-in'), ...checked(newer, 'turned-in') },
      NOW
    );
    const items = gradebookItems(p, [
      grade('m', {
        dueAt: NOW - 9 * DAY,
        flags: [{ id: 'missing', name: 'Missing', key: 'M', color: 'rose' }],
      }),
    ]);
    expect(items.map((i) => [i.sessionId, i.missing])).toEqual([
      ['m', true],
      ['new', false],
      ['old', false],
    ]);
  });
});

describe('completedItems', () => {
  it('keeps the partition order and marks Missing rows', () => {
    const missed = a({
      sessionId: 'm',
      channel: 'ended',
      endedAt: NOW - DAY,
      dueAt: NOW - 2 * DAY,
    });
    const p = partitionLanding([missed], checked(missed, 'not-started'), NOW);
    expect(
      completedItems(p.expired).map((i) => [i.sessionId, i.missing])
    ).toEqual([['m', true]]);
  });
});

describe('withLandingPass', () => {
  const passes = {
    studentAccess: { s1: NOW + DAY },
    studentAccessFrom: { s1: NOW - 1 },
  };

  it('opens a closed or paused quiz row for the scheduled student', () => {
    const closed = a({ closeAt: NOW - DAY, held: 'paused', passes });
    const open = withLandingPass(closed, 's1', NOW);
    expect(open.held).toBeUndefined();
    expect(open.closeAt).toBe(NOW + DAY);
    expect(landingRowState(open, {}, NOW)).toBe('open');
    expect(withLandingPass(closed, 's2', NOW)).toBe(closed);
  });

  it('lists the row as workable in the partition', () => {
    const row = a({ held: 'paused', passes });
    const out = partitionLanding([row], {}, NOW, 's1');
    expect(workAvailability(out.work[0], NOW, 's1')).toBe('open');
  });

  it('never reopens an ended run', () => {
    const ended = a({ channel: 'ended', passes });
    expect(withLandingPass(ended, 's1', NOW)).toBe(ended);
  });
});
