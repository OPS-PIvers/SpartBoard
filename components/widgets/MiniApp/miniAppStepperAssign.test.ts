import { describe, it, expect } from 'vitest';
import { planMiniAppStepperAssign } from './miniAppStepperAssign';
import { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';
import type { AssignAvailability } from '@/utils/assignAvailability';
import type { ClassRoster, Student } from '@/types';

const student = (id: string, sourcedId?: string): Student => ({
  id,
  firstName: id,
  lastName: 'Kid',
  pin: '01',
  ...(sourcedId ? { classLinkSourcedId: sourcedId } : {}),
});

const roster = (
  id: string,
  extra: Partial<ClassRoster>,
  students: Student[]
): ClassRoster => ({ id, name: id, students, ...extra }) as ClassRoster;

const ROSTERS: ClassRoster[] = [
  roster('r1', { classlinkClassId: 'cl-1' }, [
    student('s1', 'SID-1'),
    student('s2', 'SID-2'),
  ]),
  roster('r2', { classlinkClassId: 'cl-2' }, [student('s3', 'SID-3')]),
  roster('r3', { classlinkClassId: 'cl-3', loadError: 'Drive failed' }, []),
];

const NOW = new Date(2026, 9, 8, 9, 0);

const AVAILABILITY: AssignAvailability = {
  all: {
    opens: { day: '2026-10-08', time: '09:00' },
    closes: { day: '2026-10-09', time: '15:00' },
  },
  allowLate: false,
};

const bellWindow = () => ({
  openAt: NOW.getTime(),
  closeAt: NOW.getTime() + 50 * 60_000,
});

describe('planMiniAppStepperAssign (D20)', () => {
  it('saves a scheduled study resource with its window and no gate', () => {
    const plan = planMiniAppStepperAssign(
      {
        kind: 'resource',
        classes: { classIds: ['r1'], studentsByClass: {} },
        when: { mode: 'scheduled', availability: AVAILABILITY },
        targeting: EMPTY_ASSIGN_TARGETING_VALUE,
      },
      { rosters: ROSTERS, bellWindow: undefined, now: NOW }
    );
    expect(plan.targeting.workKind).toBe('resource');
    expect(plan.targeting.openAt).toBe(new Date(2026, 9, 8, 9, 0).getTime());
    expect(plan.periodGate).toBeUndefined();
    expect(plan.payload.studentTargetClassIds).toBeUndefined();
  });

  it('starts one class paused for Manual, with no shared window or due date', () => {
    const plan = planMiniAppStepperAssign(
      {
        kind: 'work',
        classes: { classIds: ['r1'], studentsByClass: {} },
        when: { mode: 'manual', availability: AVAILABILITY },
        targeting: EMPTY_ASSIGN_TARGETING_VALUE,
      },
      { rosters: ROSTERS, bellWindow, now: NOW }
    );
    expect(plan.targeting.workKind).toBe('work');
    expect(plan.targeting.dueAt).toBeUndefined();
    expect(plan.periodGate?.accessMode).toBe('assessment');
    expect(Object.keys(plan.periodGate?.periodAccess ?? {})).toEqual(['cl-1']);
    expect(plan.payload.window.openAt).toBeUndefined();
  });

  it('narrows a class to its picked students next to a whole class', () => {
    const plan = planMiniAppStepperAssign(
      {
        kind: 'work',
        classes: {
          classIds: ['r1', 'r2'],
          studentsByClass: {
            r1: [{ kind: 'classlink', sourcedId: 'SID-2' }],
          },
        },
        when: { mode: 'scheduled', availability: AVAILABILITY },
        targeting: EMPTY_ASSIGN_TARGETING_VALUE,
      },
      { rosters: ROSTERS, bellWindow: undefined, now: NOW }
    );
    expect(plan.payload.studentTargetClassIds).toEqual(['cl-1']);
    expect(plan.payload.add).toEqual([
      { kind: 'classlink', sourcedId: 'SID-2' },
    ]);
  });

  it('drops a picked class whose students failed to load', () => {
    const plan = planMiniAppStepperAssign(
      {
        kind: 'work',
        classes: { classIds: ['r2', 'r3'], studentsByClass: {} },
        when: { mode: 'scheduled', availability: AVAILABILITY },
        targeting: EMPTY_ASSIGN_TARGETING_VALUE,
      },
      { rosters: ROSTERS, bellWindow: undefined, now: NOW }
    );
    expect(plan.selectedRosters.map((r) => r.id)).toEqual(['r2']);
  });
});
