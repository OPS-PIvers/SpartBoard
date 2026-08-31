import { describe, it, expect } from 'vitest';
import {
  resolveStudentTargetRef,
  studentTargetRefKey,
  studentTargetRefEquals,
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
