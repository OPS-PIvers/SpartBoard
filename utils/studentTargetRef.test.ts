import { describe, it, expect } from 'vitest';
import {
  resolveStudentTargetRef,
  studentTargetRefKey,
  studentTargetRefEquals,
  buildSetAssignmentTargetsPayload,
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import type { Student } from '@/types';

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
