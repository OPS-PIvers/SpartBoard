import { describe, it, expect } from 'vitest';
import {
  resolveStudentTargetRef,
  studentTargetRefKey,
  studentTargetRefEquals,
  buildSetAssignmentTargetsPayload,
  classStudentRows,
  expandClassTargeting,
  payloadRequiresCall,
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import type { ClassRoster, Student } from '@/types';

const baseStudent: Student = {
  id: 's1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  pin: '01',
};

describe('resolveStudentTargetRef', () => {
  it('resolves a classlink-sourced student', () => {
    const student: Student = { ...baseStudent, classLinkSourcedId: 'SID-1' };
    expect(resolveStudentTargetRef(student, {})).toEqual({
      kind: 'classlink',
      sourcedId: 'SID-1',
    });
  });

  it('resolves a test-class student by email when the roster carries testClassId', () => {
    const student: Student = { ...baseStudent, email: 'Ada@Example.com' };
    expect(resolveStudentTargetRef(student, { testClassId: 'demo' })).toEqual({
      kind: 'test',
      email: 'Ada@Example.com',
    });
  });

  it('returns null for a manually-created student (no sourcedId, no test roster)', () => {
    expect(resolveStudentTargetRef(baseStudent, {})).toBeNull();
  });

  it('returns null for a test-class roster student missing email', () => {
    expect(
      resolveStudentTargetRef(baseStudent, { testClassId: 'demo' })
    ).toBeNull();
  });
});

describe('studentTargetRefKey', () => {
  it('preserves sourcedId case for classlink refs', () => {
    expect(
      studentTargetRefKey({ kind: 'classlink', sourcedId: 'AbC123' })
    ).toBe('classlink:AbC123');
  });

  it('lowercases email for test refs', () => {
    expect(
      studentTargetRefKey({ kind: 'test', email: 'Kid@Example.COM' })
    ).toBe('test:kid@example.com');
  });
});

describe('studentTargetRefEquals', () => {
  it('treats differently-cased test emails as equal', () => {
    expect(
      studentTargetRefEquals(
        { kind: 'test', email: 'Kid@Example.com' },
        { kind: 'test', email: 'kid@example.com' }
      )
    ).toBe(true);
  });

  it('treats different sourcedIds as unequal', () => {
    expect(
      studentTargetRefEquals(
        { kind: 'classlink', sourcedId: 'A' },
        { kind: 'classlink', sourcedId: 'B' }
      )
    ).toBe(false);
  });
});

describe('buildSetAssignmentTargetsPayload', () => {
  const refA = { kind: 'classlink', sourcedId: 'SID-A' } as const;
  const refB = { kind: 'classlink', sourcedId: 'SID-B' } as const;

  it('first save (no previous): every current student is an add, every override is emitted', () => {
    const current: AssignTargetingValue = {
      targetMode: 'students',
      targetStudents: [refA, refB],
      targetGroupIds: [],
      overridesByKey: { 'classlink:SID-A': { timeMultiplier: 2 } },
      excludedStudents: [],
      openAt: 1000,
    };
    const payload = buildSetAssignmentTargetsPayload(undefined, current);
    expect(payload.targetMode).toBe('students');
    expect(payload.add).toEqual(expect.arrayContaining([refA, refB]));
    expect(payload.remove).toEqual([]);
    expect(payload.overridesBySourcedId).toEqual({
      'classlink:SID-A': { timeMultiplier: 2 },
    });
    expect(payload.window).toEqual({ openAt: 1000 });
  });

  it('adds newly-selected students and removes deselected ones', () => {
    const previous: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      targetMode: 'students',
      targetStudents: [refA],
    };
    const current: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      targetMode: 'students',
      targetStudents: [refB],
    };
    const payload = buildSetAssignmentTargetsPayload(previous, current);
    expect(payload.add).toEqual([refB]);
    expect(payload.remove).toEqual([refA]);
  });

  it('emits an explicit null when an override is removed', () => {
    const previous: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      targetMode: 'students',
      targetStudents: [refA],
      overridesByKey: { 'classlink:SID-A': { timeMultiplier: 2 } },
    };
    const current: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      targetMode: 'students',
      targetStudents: [refA],
      overridesByKey: {},
    };
    const payload = buildSetAssignmentTargetsPayload(previous, current);
    expect(payload.overridesBySourcedId).toEqual({ 'classlink:SID-A': null });
  });

  it('emits an explicit null when a targeted student with an override is removed entirely', () => {
    const previous: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      targetMode: 'students',
      targetStudents: [refA],
      overridesByKey: { 'classlink:SID-A': { timeMultiplier: 2 } },
    };
    const current: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      targetMode: 'students',
      targetStudents: [],
      overridesByKey: {},
    };
    const payload = buildSetAssignmentTargetsPayload(previous, current);
    expect(payload.remove).toEqual([refA]);
    expect(payload.overridesBySourcedId).toEqual({ 'classlink:SID-A': null });
  });

  it('omits the key entirely when an override is unchanged', () => {
    const previous: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      targetMode: 'students',
      targetStudents: [refA],
      overridesByKey: { 'classlink:SID-A': { timeMultiplier: 2 } },
    };
    const current: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      targetMode: 'students',
      targetStudents: [refA],
      overridesByKey: { 'classlink:SID-A': { timeMultiplier: 2 } },
    };
    const payload = buildSetAssignmentTargetsPayload(previous, current);
    expect(payload.overridesBySourcedId).toEqual({});
  });

  it('emits an explicit null for a window field that is cleared, and omits an unchanged one', () => {
    const previous: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      openAt: 1000,
      closeAt: 2000,
    };
    const current: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      closeAt: 2000,
    };
    const payload = buildSetAssignmentTargetsPayload(previous, current);
    expect(payload.window).toEqual({ openAt: null });
  });

  it('emits a changed window field value', () => {
    const previous: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      closeAt: 2000,
    };
    const current: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      closeAt: 3000,
    };
    const payload = buildSetAssignmentTargetsPayload(previous, current);
    expect(payload.window).toEqual({ closeAt: 3000 });
  });
});

const classRoster: ClassRoster = {
  id: 'r1',
  name: 'Period 2',
  driveFileId: 'f1',
  studentCount: 2,
  createdAt: 0,
  defaultOverridesByStudentId: { s2: { timeMultiplier: 2 } },
  students: [
    {
      id: 's1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      pin: '01',
      classLinkSourcedId: 'SID-1',
    },
    {
      id: 's2',
      firstName: 'Grace',
      lastName: 'Hopper',
      pin: '02',
      classLinkSourcedId: 'SID-2',
    },
    { id: 's3', firstName: 'No', lastName: 'Sso', pin: '03' },
  ],
};
const classContext = { rosters: [classRoster], selectedRosterIds: ['r1'] };

describe('classStudentRows', () => {
  it('lists only individually-targetable students of the checked classes', () => {
    const rows = classStudentRows(classContext);
    expect(rows.map((r) => r.key)).toEqual([
      'classlink:SID-1',
      'classlink:SID-2',
    ]);
    expect(rows[1].defaultOverride).toEqual({ timeMultiplier: 2 });
  });

  it('merges the standing defaults of a student in two checked classes', () => {
    const second: ClassRoster = {
      ...classRoster,
      id: 'r2',
      name: 'Period 3',
      defaultOverridesByStudentId: { s1: { readAloud: true } },
    };
    const rows = classStudentRows({
      rosters: [classRoster, second],
      selectedRosterIds: ['r1', 'r2'],
    });
    expect(
      rows.find((r) => r.key === 'classlink:SID-1')?.defaultOverride
    ).toEqual({ readAloud: true });
    expect(
      rows.find((r) => r.key === 'classlink:SID-2')?.defaultOverride
    ).toEqual({ timeMultiplier: 2 });
  });

  it('ignores rosters that are not checked', () => {
    expect(
      classStudentRows({ rosters: [classRoster], selectedRosterIds: [] })
    ).toEqual([]);
  });
});

describe('expandClassTargeting', () => {
  it('snapshots standing roster accommodations without leaving class mode', () => {
    const expanded = expandClassTargeting(
      EMPTY_ASSIGN_TARGETING_VALUE,
      classContext
    );
    expect(expanded.targetMode).toBe('class');
    expect(expanded.targetStudents).toEqual([
      { kind: 'classlink', sourcedId: 'SID-2' },
    ]);
    expect(expanded.overridesByKey).toEqual({
      'classlink:SID-2': { timeMultiplier: 2 },
    });
  });

  it('lets an assignment-level edit win over the standing default', () => {
    const expanded = expandClassTargeting(
      {
        ...EMPTY_ASSIGN_TARGETING_VALUE,
        overridesByKey: { 'classlink:SID-2': { timeMultiplier: 1.5 } },
      },
      classContext
    );
    expect(expanded.overridesByKey).toEqual({
      'classlink:SID-2': { timeMultiplier: 1.5 },
    });
  });

  it('keeps class mode when a student is skipped', () => {
    const expanded = expandClassTargeting(
      {
        ...EMPTY_ASSIGN_TARGETING_VALUE,
        excludedStudents: [{ kind: 'classlink', sourcedId: 'SID-2' }],
      },
      classContext
    );
    expect(expanded.targetMode).toBe('class');
    // SID-2's standing default is dropped along with them; SID-1 has none, so
    // nobody needs a pointer doc for accommodations.
    expect(expanded.targetStudents).toEqual([]);
    expect(expanded.overridesByKey).toEqual({});
    expect(expanded.excludedStudents).toEqual([
      { kind: 'classlink', sourcedId: 'SID-2' },
    ]);
  });

  it('prunes a skip for a student no longer in any checked class', () => {
    const expanded = expandClassTargeting(
      {
        ...EMPTY_ASSIGN_TARGETING_VALUE,
        excludedStudents: [{ kind: 'classlink', sourcedId: 'GONE' }],
        overridesByKey: { 'classlink:GONE': { timeMultiplier: 2 } },
      },
      classContext
    );
    expect(expanded.excludedStudents).toEqual([]);
    expect(expanded.overridesByKey['classlink:GONE']).toBeUndefined();
  });

  it('leaves a legacy hand-picked value untouched', () => {
    const legacy: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      targetMode: 'students',
      targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
    };
    expect(expandClassTargeting(legacy, classContext)).toBe(legacy);
  });
});

describe('buildSetAssignmentTargetsPayload with a class context', () => {
  it('emits the roster defaults as adds and overrides, with no excludedTargets', () => {
    const payload = buildSetAssignmentTargetsPayload(
      undefined,
      EMPTY_ASSIGN_TARGETING_VALUE,
      classContext
    );
    expect(payload.targetMode).toBe('class');
    expect(payload.add).toEqual([{ kind: 'classlink', sourcedId: 'SID-2' }]);
    expect(payload.overridesBySourcedId).toEqual({
      'classlink:SID-2': { timeMultiplier: 2 },
    });
    expect(payload.excludedTargets).toBeUndefined();
    expect(payloadRequiresCall(payload)).toBe(true);
  });

  it('emits excludedTargets only once a student is skipped', () => {
    const payload = buildSetAssignmentTargetsPayload(
      undefined,
      {
        ...EMPTY_ASSIGN_TARGETING_VALUE,
        excludedStudents: [{ kind: 'classlink', sourcedId: 'SID-2' }],
      },
      classContext
    );
    expect(payload.excludedTargets).toEqual([
      { kind: 'classlink', sourcedId: 'SID-2' },
    ]);
    // The class channel keeps delivering to everyone else, including students
    // with no SSO identity — the skip rides on a pointer doc instead.
    expect(payload.targetMode).toBe('class');
    expect(payloadRequiresCall(payload)).toBe(true);
  });

  it('removes the pointer of an un-skipped student with no override', () => {
    const previous: AssignTargetingValue = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      excludedStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
    };
    const payload = buildSetAssignmentTargetsPayload(
      previous,
      EMPTY_ASSIGN_TARGETING_VALUE,
      classContext
    );
    expect(payload.remove).toEqual([{ kind: 'classlink', sourcedId: 'SID-1' }]);
    expect(payload.excludedTargets).toEqual([]);
  });

  it('calls the CF for a window-only edit once pointers exist', () => {
    const payload = buildSetAssignmentTargetsPayload(
      { ...EMPTY_ASSIGN_TARGETING_VALUE, closeAt: 1 },
      { ...EMPTY_ASSIGN_TARGETING_VALUE, closeAt: 2 },
      { rosters: [], selectedRosterIds: [] }
    );
    expect(payloadRequiresCall(payload)).toBe(false);
    expect(payloadRequiresCall(payload, true)).toBe(true);
  });

  it('skips the callable entirely for a plain class-wide assign', () => {
    const payload = buildSetAssignmentTargetsPayload(
      undefined,
      EMPTY_ASSIGN_TARGETING_VALUE,
      { rosters: [], selectedRosterIds: [] }
    );
    expect(payloadRequiresCall(payload)).toBe(false);
  });

  it('flags an un-skip separately from a real de-targeting', () => {
    const previous = {
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      targetStudents: [{ kind: 'classlink' as const, sourcedId: 'SID-2' }],
      excludedStudents: [{ kind: 'classlink' as const, sourcedId: 'SID-1' }],
    };
    const payload = buildSetAssignmentTargetsPayload(
      previous,
      EMPTY_ASSIGN_TARGETING_VALUE
    );
    expect(payload.unskipped).toEqual([
      { kind: 'classlink', sourcedId: 'SID-1' },
    ]);
    expect(payload.remove).toEqual([
      { kind: 'classlink', sourcedId: 'SID-2' },
      { kind: 'classlink', sourcedId: 'SID-1' },
    ]);
  });

  it('does not re-apply roster defaults when useRosterDefaults is false', () => {
    const roster = {
      id: 'r1',
      name: 'Period 2',
      students: [
        {
          id: 's1',
          firstName: 'Ada',
          lastName: 'Byron',
          classLinkSourcedId: 'SID-1',
        },
      ],
      defaultOverridesByStudentId: { s1: { timeMultiplier: 2 } },
    } as never;
    const ctx = { rosters: [roster], selectedRosterIds: ['r1'] };
    expect(
      expandClassTargeting(EMPTY_ASSIGN_TARGETING_VALUE, ctx).overridesByKey
    ).toEqual({ 'classlink:SID-1': { timeMultiplier: 2 } });
    expect(
      expandClassTargeting(EMPTY_ASSIGN_TARGETING_VALUE, ctx, {
        useRosterDefaults: false,
      }).overridesByKey
    ).toEqual({});
  });
});
