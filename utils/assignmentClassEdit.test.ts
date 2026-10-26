import { describe, expect, it } from 'vitest';
import type { ClassRoster, PeriodAccess } from '@/types';
import {
  canEditAssignmentClasses,
  externalClassIds,
  planAssignmentClassEdit,
} from './assignmentClassEdit';

const roster = (id: string, classlinkClassId?: string): ClassRoster =>
  ({
    id,
    name: `Period ${id}`,
    students: [],
    ...(classlinkClassId ? { classlinkClassId } : {}),
  }) as unknown as ClassRoster;

const rosters = [roster('1', 'cl.1'), roster('2', 'cl-2'), roster('3')];

const row = (rosterId: string, label: string): PeriodAccess => ({
  state: 'open',
  openAt: 100,
  closeAt: 200,
  bellPeriodId: null,
  verified: true,
  label,
  rosterId,
});

describe('planAssignmentClassEdit', () => {
  it('derives the session targets from the checked classes', () => {
    expect(planAssignmentClassEdit({ rosters, rosterIds: ['1', '3'] })).toEqual(
      {
        rosterIds: ['1', '3'],
        classIds: ['cl.1'],
        periodNames: ['Period 1', 'Period 3'],
        classPeriodByClassId: { 'cl.1': 'Period 1' },
      }
    );
  });

  it('adds a row on the shared window and removes unchecked rows on a per-period session', () => {
    const edit = planAssignmentClassEdit({
      rosters,
      rosterIds: ['2', '3'],
      accessMode: 'assignment',
      periodAccess: {
        'cl.1': row('1', 'Period 1'),
        'cl-2': row('2', 'Period 2'),
      },
    });
    expect(edit.periodAccessRows).toEqual({
      'cl.1': null,
      'roster:3': expect.objectContaining({
        state: 'open',
        openAt: 100,
        closeAt: 200,
        rosterId: '3',
      }) as unknown,
    });
  });

  it('starts an added class closed on a Manual session', () => {
    const edit = planAssignmentClassEdit({
      rosters,
      rosterIds: ['1', '2'],
      accessMode: 'assessment',
      periodAccess: { 'cl.1': row('1', 'Period 1') },
    });
    expect(edit.periodAccessRows?.['cl-2']).toMatchObject({
      state: 'closed',
      openAt: null,
    });
  });
});

describe('externalClassIds', () => {
  it('keeps only Classroom and Schoology ids', () => {
    expect(
      externalClassIds(['cl-1', 'classroom:c1', 'schoology:s2', 3, 't-1'])
    ).toEqual(['classroom:c1', 'schoology:s2']);
  });
});

describe('canEditAssignmentClasses', () => {
  it('skips individually targeted assignments', () => {
    expect(canEditAssignmentClasses({})).toBe(true);
    expect(canEditAssignmentClasses({ targetMode: 'students' })).toBe(false);
    expect(canEditAssignmentClasses({ targetGroupIds: ['g1'] })).toBe(false);
    expect(canEditAssignmentClasses({ overridesBySourcedId: { s1: {} } })).toBe(
      false
    );
  });
});
