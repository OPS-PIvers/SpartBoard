import { describe, it, expect } from 'vitest';
import {
  buildMixedTargetsPayload,
  expandMixedTargeting,
  partialRosterIds,
  type AssignClassesValue,
} from '@/utils/assignTargets';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  payloadRequiresCall,
} from '@/utils/studentTargetRef';
import type { ClassRoster, Student, StudentTargetRef } from '@/types';

const student = (id: string, sourcedId?: string, email?: string): Student => ({
  id,
  firstName: id,
  lastName: 'Kid',
  pin: '01',
  ...(sourcedId ? { classLinkSourcedId: sourcedId } : {}),
  ...(email ? { email } : {}),
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
    student('s3'),
  ]),
  roster(
    'r2',
    {
      classlinkClassId: 'cl-2',
      defaultOverridesByStudentId: {
        s4: { readAloud: true },
        s5: { readAloud: true },
      },
    },
    [student('s4', 'SID-4'), student('s5', 'SID-5')]
  ),
  roster('r3', { testClassId: 'demo' }, [
    student('t1', undefined, 'Kid@School.edu'),
  ]),
  roster('r4', {}, [student('l1')]),
];

const ref = (sourcedId: string): StudentTargetRef => ({
  kind: 'classlink',
  sourcedId,
});

const classes = (
  classIds: string[],
  studentsByClass: Record<string, StudentTargetRef[]> = {}
): AssignClassesValue => ({ classIds, studentsByClass });

describe('partialRosterIds', () => {
  it('lists only classes with picked students', () => {
    expect(
      partialRosterIds(classes(['r1', 'r2'], { r1: [], r2: [ref('SID-4')] }))
    ).toEqual(['r2']);
  });
});

describe('expandMixedTargeting', () => {
  it('leaves an all-whole assignment exactly as class targeting', () => {
    const { targeting, studentTargetClassIds } = expandMixedTargeting(
      EMPTY_ASSIGN_TARGETING_VALUE,
      classes(['r1']),
      ROSTERS
    );
    expect(studentTargetClassIds).toEqual([]);
    expect(targeting.targetMode).toBe('class');
    expect(targeting.targetStudents).toEqual([]);
  });

  it('targets only the picked students of a partial class', () => {
    const { targeting, studentTargetClassIds } = expandMixedTargeting(
      EMPTY_ASSIGN_TARGETING_VALUE,
      classes(['r1', 'r2'], { r2: [ref('SID-4')] }),
      ROSTERS
    );
    expect(studentTargetClassIds).toEqual(['cl-2']);
    expect(targeting.targetMode).toBe('class');
    expect(targeting.targetStudents).toEqual([ref('SID-4')]);
  });

  it('applies standing accommodations to picked students only', () => {
    const { targeting } = expandMixedTargeting(
      EMPTY_ASSIGN_TARGETING_VALUE,
      classes(['r2'], { r2: [ref('SID-4')] }),
      ROSTERS
    );
    expect(targeting.overridesByKey).toEqual({
      'classlink:SID-4': { readAloud: true },
    });
  });

  it('keeps accommodated students of a whole class alongside the picks', () => {
    const { targeting } = expandMixedTargeting(
      EMPTY_ASSIGN_TARGETING_VALUE,
      classes(['r1', 'r2'], { r1: [ref('SID-1')] }),
      ROSTERS
    );
    expect(targeting.targetStudents).toEqual(
      expect.arrayContaining([ref('SID-1'), ref('SID-4'), ref('SID-5')])
    );
    expect(targeting.targetStudents).toHaveLength(3);
  });

  it('drops a skip inside a partial class and keeps one in a whole class', () => {
    const { targeting } = expandMixedTargeting(
      {
        ...EMPTY_ASSIGN_TARGETING_VALUE,
        excludedStudents: [ref('SID-2'), ref('SID-5')],
      },
      classes(['r1', 'r2'], { r1: [ref('SID-1')] }),
      ROSTERS
    );
    expect(targeting.excludedStudents).toEqual([ref('SID-5')]);
  });

  it('narrows a test class by its slug', () => {
    const { studentTargetClassIds, targeting } = expandMixedTargeting(
      EMPTY_ASSIGN_TARGETING_VALUE,
      classes(['r3'], { r3: [{ kind: 'test', email: 'Kid@School.edu' }] }),
      ROSTERS
    );
    expect(studentTargetClassIds).toEqual(['demo']);
    expect(targeting.targetStudents).toHaveLength(1);
  });

  it('never narrows a hand-built class, which no sign-in claim matches', () => {
    const { studentTargetClassIds } = expandMixedTargeting(
      EMPTY_ASSIGN_TARGETING_VALUE,
      classes(['r4'], { r4: [ref('SID-X')] }),
      ROSTERS
    );
    expect(studentTargetClassIds).toEqual([]);
  });

  it('on a re-edit, an unpicked student leaves the target set', () => {
    const previous = expandMixedTargeting(
      EMPTY_ASSIGN_TARGETING_VALUE,
      classes(['r1'], { r1: [ref('SID-1'), ref('SID-2')] }),
      ROSTERS
    );
    const { targeting } = expandMixedTargeting(
      previous.targeting,
      classes(['r1'], { r1: [ref('SID-1')] }),
      ROSTERS,
      { useRosterDefaults: false }
    );
    expect(targeting.targetStudents).toEqual([ref('SID-1')]);
  });
});

describe('buildMixedTargetsPayload', () => {
  it('omits the narrowing for an all-whole first assign, so no call is needed', () => {
    const current = expandMixedTargeting(
      EMPTY_ASSIGN_TARGETING_VALUE,
      classes(['r1']),
      ROSTERS
    );
    const payload = buildMixedTargetsPayload(undefined, current);
    expect('studentTargetClassIds' in payload).toBe(false);
    expect(payloadRequiresCall(payload)).toBe(false);
  });

  it('adds the picked students and sends the narrowed classes', () => {
    const current = expandMixedTargeting(
      EMPTY_ASSIGN_TARGETING_VALUE,
      classes(['r1', 'r2'], { r2: [ref('SID-4')] }),
      ROSTERS
    );
    const payload = buildMixedTargetsPayload(undefined, current);
    expect(payload.targetMode).toBe('class');
    expect(payload.add).toEqual([ref('SID-4')]);
    expect(payload.studentTargetClassIds).toEqual(['cl-2']);
    expect(payload.overridesBySourcedId).toEqual({
      'classlink:SID-4': { readAloud: true },
    });
    expect(payloadRequiresCall(payload)).toBe(true);
  });

  it('clears the narrowing when a class goes back to all students', () => {
    const previous = expandMixedTargeting(
      EMPTY_ASSIGN_TARGETING_VALUE,
      classes(['r1'], { r1: [ref('SID-1')] }),
      ROSTERS
    );
    const current = expandMixedTargeting(
      previous.targeting,
      classes(['r1']),
      ROSTERS,
      { useRosterDefaults: false }
    );
    const payload = buildMixedTargetsPayload(previous, current);
    expect(payload.studentTargetClassIds).toEqual([]);
    // A re-edit keeps stored targets (as class mode does today); the class channel now reaches everyone.
    expect(payload.remove).toEqual([]);
    expect(payloadRequiresCall(payload)).toBe(true);
  });
});
