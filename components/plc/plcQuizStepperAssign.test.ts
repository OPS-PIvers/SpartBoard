import { describe, expect, it } from 'vitest';
import type { ClassRoster } from '@/types';
import { defaultAvailability } from '@/utils/assignAvailability';
import { planPlcQuizStepperAssign } from './plcQuizStepperAssign';

const roster = (id: string, classlinkClassId: string): ClassRoster => ({
  id,
  name: id,
  driveFileId: null,
  studentCount: 1,
  createdAt: 0,
  classlinkClassId,
  bellPeriod: { buildingId: 'high', periodId: 'P1' },
  students: [
    {
      id: `${id}-s`,
      firstName: 'A',
      lastName: 'B',
      pin: '1',
      classLinkSourcedId: `SID-${id}`,
    },
  ],
});

const rosters = [roster('r1', 'cl-1'), roster('r2', 'cl-2')];
const now = new Date(2026, 9, 8, 9, 0);
const bellWindow = () => ({
  openAt: new Date(2026, 9, 8, 8, 0).getTime(),
  closeAt: new Date(2026, 9, 8, 9, 0).getTime(),
});

describe('planPlcQuizStepperAssign', () => {
  it('Manual with one class gets a closed assessment gate and no dates', () => {
    const plan = planPlcQuizStepperAssign({
      classes: { classIds: ['r1'], studentsByClass: {} },
      when: { mode: 'manual', availability: defaultAvailability(now, true) },
      rosters,
      bellWindow,
    });
    expect(plan.rosters.map((r) => r.id)).toEqual(['r1']);
    expect(plan.periodGate?.accessMode).toBe('assessment');
    expect(plan.periodGate?.periodAccess['cl-1']).toMatchObject({
      state: 'closed',
    });
    expect(plan.dueAt).toBeNull();
    expect(plan.mixed.targeting.openAt ?? null).toBeNull();
  });

  it('Scheduled without bell periods has no gate', () => {
    const plan = planPlcQuizStepperAssign({
      classes: { classIds: ['r1', 'r2'], studentsByClass: {} },
      when: {
        mode: 'scheduled',
        availability: defaultAvailability(now, false),
      },
      rosters,
      bellWindow: undefined,
    });
    expect(plan.periodGate).toBeUndefined();
    expect(plan.rosters).toHaveLength(2);
  });

  it('narrows a class to its picked students and drops picks for unpicked classes', () => {
    const plan = planPlcQuizStepperAssign({
      classes: {
        classIds: ['r1'],
        studentsByClass: {
          r1: [{ kind: 'classlink', sourcedId: 'SID-r1' }],
          r2: [{ kind: 'classlink', sourcedId: 'SID-r2' }],
        },
      },
      when: { mode: 'manual', availability: defaultAvailability(now, true) },
      rosters,
      bellWindow,
    });
    expect(plan.mixed.studentTargetClassIds).toEqual(['cl-1']);
    expect(plan.mixed.targeting.targetStudents).toEqual([
      { kind: 'classlink', sourcedId: 'SID-r1' },
    ]);
  });
});
