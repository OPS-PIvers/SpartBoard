import { describe, expect, it, vi } from 'vitest';
import type { ClassRoster, PeriodAccess } from '@/types';
import type { AssignmentClassEdit } from './assignmentClassEdit';
import {
  addToOpenAssignment,
  findOpenAssignmentClasses,
  openInputsFor,
  withoutLiveClasses,
  type OpenAssignmentInput,
} from './openAssignmentClasses';

const roster = (id: string, name: string): ClassRoster => ({
  id,
  name,
  driveFileId: null,
  studentCount: 20,
  createdAt: 0,
  students: [],
});
const ROSTERS = [
  roster('r1', 'Period 1'),
  roster('r2', 'Period 2'),
  roster('r3', 'Period 3'),
];
const NOW = 1_000_000;

const input = (o: Partial<OpenAssignmentInput>): OpenAssignmentInput => ({
  id: 'a',
  live: true,
  createdAt: 1,
  rosterIds: [],
  canAddClasses: true,
  ...o,
});

describe('findOpenAssignmentClasses', () => {
  it('finds classes a live assignment targets and picks the newest to join', () => {
    const open = findOpenAssignmentClasses(
      [
        input({ id: 'old', createdAt: 1, rosterIds: ['r1'] }),
        input({ id: 'new', createdAt: 2, rosterIds: ['r2'] }),
        input({ id: 'ended', live: false, rosterIds: ['r3'] }),
      ],
      ROSTERS,
      NOW
    );
    expect([...open.ids].sort()).toEqual(['r1', 'r2']);
    expect(open.names).toEqual(['Period 1', 'Period 2']);
    expect(open.joinTarget).toEqual({
      id: 'new',
      rosterIds: ['r2'],
      names: ['Period 2'],
    });
  });

  it('leaves out a class closed on its own row', () => {
    const closed: PeriodAccess = {
      state: 'closed',
      closedAt: NOW - 10,
      rosterId: 'r1',
    } as PeriodAccess;
    const ready: PeriodAccess = {
      state: 'closed',
      rosterId: 'r2',
    } as PeriodAccess;
    const open = findOpenAssignmentClasses(
      [
        input({
          rosterIds: ['r1', 'r2'],
          periodAccess: { k1: closed, k2: ready },
        }),
      ],
      ROSTERS,
      NOW
    );
    expect([...open.ids]).toEqual(['r2']);
  });

  it('offers no join target when classes cannot be added', () => {
    const open = findOpenAssignmentClasses(
      [input({ rosterIds: ['r1'], canAddClasses: false })],
      ROSTERS,
      NOW
    );
    expect([...open.ids]).toEqual(['r1']);
    expect(open.joinTarget).toBeNull();
  });
});

describe('kind and close time', () => {
  it('ignores a copy of another kind and one whose close time passed', () => {
    const open = findOpenAssignmentClasses(
      [
        input({ id: 'study', kind: 'study', rosterIds: ['r1'] }),
        input({ id: 'past', closeAt: NOW - 1, rosterIds: ['r2'] }),
        input({ id: 'check', kind: 'check', rosterIds: ['r3'] }),
      ],
      ROSTERS,
      NOW,
      'check'
    );
    expect([...open.ids]).toEqual(['r3']);
    expect(open.joinTarget?.id).toBe('check');
  });
});

describe('openInputsFor', () => {
  it('skips staff and view-only copies and individually targeted ones cannot take classes', () => {
    const rows = openInputsFor(
      [
        { id: 'a', createdAt: 1, rosterIds: ['r1'], itemId: 'x' },
        {
          id: 'b',
          createdAt: 1,
          rosterIds: [],
          audience: 'staff',
          itemId: 'x',
        },
        {
          id: 'c',
          createdAt: 1,
          rosterIds: [],
          mode: 'view-only',
          itemId: 'x',
        },
        { id: 'd', createdAt: 1, rosterIds: ['r2'], itemId: 'y' },
        {
          id: 'e',
          createdAt: 1,
          rosterIds: ['r3'],
          itemId: 'x',
          targetMode: 'students' as const,
        },
      ],
      ROSTERS,
      (a) => a.itemId === 'x',
      () => true
    );
    expect(rows.map((r) => [r.id, r.canAddClasses])).toEqual([
      ['a', true],
      ['e', false],
    ]);
  });
});

describe('withoutLiveClasses', () => {
  it('drops remembered classes a live copy already targets', () => {
    expect(
      withoutLiveClasses(
        ['r1', 'r2', 'r3'],
        [
          input({ rosterIds: ['r1'] }),
          input({ live: false, rosterIds: ['r2'] }),
        ]
      )
    ).toEqual(['r2', 'r3']);
  });
});

describe('addToOpenAssignment', () => {
  it('saves the open classes plus the new ones', async () => {
    const save = vi
      .fn<(a: unknown, edit: AssignmentClassEdit) => Promise<void>>()
      .mockResolvedValue(undefined);
    const toast = vi.fn();
    await addToOpenAssignment({
      assignments: [{ id: 'a', createdAt: 1, rosterIds: ['r1'] }],
      assignmentId: 'a',
      rosters: ROSTERS,
      addRosterIds: ['r3'],
      save,
      toast,
    });
    expect(save.mock.calls[0][1].rosterIds).toEqual(['r1', 'r3']);
    expect(save.mock.calls[0][1].removedRosterNames).toEqual([]);
    expect(toast).toHaveBeenCalledWith('Added to the assignment.', 'success');
  });

  it('toasts and rethrows a failed save', async () => {
    const toast = vi.fn();
    await expect(
      addToOpenAssignment({
        assignments: [{ id: 'a', createdAt: 1, rosterIds: ['r1'] }],
        assignmentId: 'a',
        rosters: ROSTERS,
        addRosterIds: ['r2'],
        save: () => Promise.reject(new Error('nope')),
        toast,
      })
    ).rejects.toThrow('nope');
    expect(toast).toHaveBeenCalledWith("Couldn't add the classes.", 'error');
  });
});
