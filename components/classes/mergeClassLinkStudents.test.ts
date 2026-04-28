import { describe, it, expect } from 'vitest';
import { Student, ClassLinkStudent } from '@/types';
import { mergeClassLinkStudents } from './mergeClassLinkStudents';

const makeLocal = (overrides: Partial<Student> = {}): Student => ({
  id: crypto.randomUUID(),
  firstName: 'Local',
  lastName: 'Student',
  pin: '01',
  ...overrides,
});

const makeCL = (
  overrides: Partial<ClassLinkStudent> = {}
): ClassLinkStudent => ({
  sourcedId: 'cl-' + crypto.randomUUID(),
  givenName: 'CL',
  familyName: 'Student',
  email: 'x@x.com',
  ...overrides,
});

describe('mergeClassLinkStudents', () => {
  it('appends new students when no existing roster', () => {
    const cl = [makeCL({ givenName: 'Ada', familyName: 'Lovelace' })];
    const result = mergeClassLinkStudents([], cl);
    expect(result.addedCount).toBe(1);
    expect(result.matchedCount).toBe(0);
    expect(result.students).toHaveLength(1);
    expect(result.students[0].firstName).toBe('Ada');
    expect(result.students[0].classLinkSourcedId).toBe(cl[0].sourcedId);
    expect(result.students[0].pin).toBe(''); // caller assigns
  });

  it('matches by classLinkSourcedId and preserves id + pin (handles upstream rename)', () => {
    const existing = makeLocal({
      firstName: 'Old',
      lastName: 'Name',
      pin: '42',
      classLinkSourcedId: 'stable-1',
    });
    const cl = [
      makeCL({
        sourcedId: 'stable-1',
        givenName: 'Renamed',
        familyName: 'Upstream',
      }),
    ];
    const result = mergeClassLinkStudents([existing], cl);
    expect(result.matchedCount).toBe(1);
    expect(result.alreadySourcedCount).toBe(1);
    expect(result.addedCount).toBe(0);
    // Existing row untouched (we deliberately do NOT overwrite local name)
    expect(result.students[0].firstName).toBe('Old');
    expect(result.students[0].lastName).toBe('Name');
    expect(result.students[0].pin).toBe('42');
    expect(result.students[0].id).toBe(existing.id);
  });

  it('matches by normalized name and stamps classLinkSourcedId', () => {
    const existing = makeLocal({
      firstName: 'Ada',
      lastName: 'Lovelace',
      pin: '01',
    });
    const cl = [
      makeCL({
        sourcedId: 'cl-ada',
        givenName: 'ada',
        familyName: 'LOVELACE',
      }),
    ];
    const result = mergeClassLinkStudents([existing], cl);
    expect(result.matchedCount).toBe(1);
    expect(result.alreadySourcedCount).toBe(0);
    expect(result.addedCount).toBe(0);
    expect(result.students[0].id).toBe(existing.id);
    expect(result.students[0].pin).toBe('01');
    expect(result.students[0].classLinkSourcedId).toBe('cl-ada');
  });

  it('preserves local-only students (aides, kids not in SIS) — additive only', () => {
    const existing = [
      makeLocal({ firstName: 'Ada', lastName: 'Lovelace', pin: '01' }),
      makeLocal({ firstName: 'Local', lastName: 'Aide', pin: '99' }),
    ];
    const cl = [
      makeCL({ sourcedId: 'cl-ada', givenName: 'Ada', familyName: 'Lovelace' }),
      makeCL({ sourcedId: 'cl-new', givenName: 'New', familyName: 'Kid' }),
    ];
    const result = mergeClassLinkStudents(existing, cl);
    expect(result.addedCount).toBe(1);
    expect(result.matchedCount).toBe(1);
    // Local aide remains in result with their pin
    const aide = result.students.find((s) => s.lastName === 'Aide');
    expect(aide).toBeDefined();
    expect(aide?.pin).toBe('99');
  });

  it('running merge twice is a no-op (sourcedIds already stamped)', () => {
    const existing = [makeLocal({ firstName: 'Ada', lastName: 'Lovelace' })];
    const cl = [
      makeCL({ sourcedId: 'cl-ada', givenName: 'Ada', familyName: 'Lovelace' }),
    ];
    const first = mergeClassLinkStudents(existing, cl);
    const second = mergeClassLinkStudents(first.students, cl);
    expect(second.addedCount).toBe(0);
    expect(second.alreadySourcedCount).toBe(1);
    expect(second.students).toHaveLength(1);
  });

  it('handles name collision: two ClassLink students with same name', () => {
    const existing = [
      makeLocal({ firstName: 'Alex', lastName: 'Smith', pin: '01' }),
    ];
    const cl = [
      makeCL({
        sourcedId: 'cl-alex-1',
        givenName: 'Alex',
        familyName: 'Smith',
      }),
      makeCL({
        sourcedId: 'cl-alex-2',
        givenName: 'Alex',
        familyName: 'Smith',
      }),
    ];
    const result = mergeClassLinkStudents(existing, cl);
    // First matches the local row; second is appended as a new student
    expect(result.addedCount).toBe(1);
    expect(result.matchedCount).toBe(1);
    expect(result.students).toHaveLength(2);
    expect(result.students[0].classLinkSourcedId).toBe('cl-alex-1');
    expect(result.students[0].pin).toBe('01');
    expect(result.students[1].classLinkSourcedId).toBe('cl-alex-2');
    expect(result.students[1].pin).toBe('');
  });

  it('matches across trailing/leading whitespace in either name component', () => {
    const existing = [
      makeLocal({ firstName: 'Ada ', lastName: ' Lovelace', pin: '01' }),
    ];
    const cl = [
      makeCL({ sourcedId: 'cl-ada', givenName: 'Ada', familyName: 'Lovelace' }),
    ];
    const result = mergeClassLinkStudents(existing, cl);
    expect(result.matchedCount).toBe(1);
    expect(result.addedCount).toBe(0);
    expect(result.students[0].classLinkSourcedId).toBe('cl-ada');
    expect(result.students[0].pin).toBe('01');
  });

  it('persists email on appended students and backfills it on matched ones', () => {
    // Pre-existing students: one matched by sourcedId, one matched by name,
    // one local-only. Each starts without an email; the merge should backfill
    // emails from the ClassLink payload onto the two matched rows and stamp
    // the email onto the newly appended row.
    const existing = [
      makeLocal({
        firstName: 'Ada',
        lastName: 'Lovelace',
        pin: '01',
        classLinkSourcedId: 'cl-ada',
      }),
      makeLocal({
        firstName: 'Grace',
        lastName: 'Hopper',
        pin: '02',
      }),
      makeLocal({
        firstName: 'Local',
        lastName: 'Aide',
        pin: '99',
      }),
    ];
    const cl = [
      makeCL({
        sourcedId: 'cl-ada',
        givenName: 'Ada',
        familyName: 'Lovelace',
        email: 'ada@school.org',
      }),
      makeCL({
        sourcedId: 'cl-grace',
        givenName: 'Grace',
        familyName: 'Hopper',
        email: 'grace@school.org',
      }),
      makeCL({
        sourcedId: 'cl-alan',
        givenName: 'Alan',
        familyName: 'Turing',
        email: 'alan@school.org',
      }),
    ];
    const result = mergeClassLinkStudents(existing, cl);

    const ada = result.students.find((s) => s.firstName === 'Ada');
    expect(ada?.email).toBe('ada@school.org');
    expect(ada?.pin).toBe('01'); // unchanged

    const grace = result.students.find((s) => s.firstName === 'Grace');
    expect(grace?.email).toBe('grace@school.org');
    expect(grace?.pin).toBe('02'); // unchanged

    const alan = result.students.find((s) => s.firstName === 'Alan');
    expect(alan?.email).toBe('alan@school.org');

    // Local aide must NOT receive an email (no upstream match).
    const aide = result.students.find((s) => s.lastName === 'Aide');
    expect(aide?.email).toBeUndefined();
  });

  it('does not overwrite an existing email on re-sync', () => {
    // If a teacher already edited a student's email locally, the merge
    // should preserve it even when ClassLink reports a different value.
    const existing = makeLocal({
      firstName: 'Ada',
      lastName: 'Lovelace',
      pin: '01',
      classLinkSourcedId: 'cl-ada',
      email: 'manual@school.org',
    });
    const cl = [
      makeCL({
        sourcedId: 'cl-ada',
        givenName: 'Ada',
        familyName: 'Lovelace',
        email: 'upstream@school.org',
      }),
    ];
    const result = mergeClassLinkStudents([existing], cl);
    expect(result.students[0].email).toBe('manual@school.org');
  });

  it('sourcedId match wins even if a different local row has matching name', () => {
    const existing = [
      makeLocal({
        firstName: 'Ada',
        lastName: 'Lovelace',
        pin: '01',
        classLinkSourcedId: 'cl-ada',
      }),
      // This row has the same name but no sourcedId
      makeLocal({ firstName: 'Ada', lastName: 'Lovelace', pin: '77' }),
    ];
    const cl = [
      makeCL({ sourcedId: 'cl-ada', givenName: 'Ada', familyName: 'Lovelace' }),
    ];
    const result = mergeClassLinkStudents(existing, cl);
    expect(result.matchedCount).toBe(1);
    expect(result.alreadySourcedCount).toBe(1);
    expect(result.addedCount).toBe(0);
    // Second "Ada Lovelace" row is untouched (no sourcedId stamped)
    expect(result.students[1].classLinkSourcedId).toBeUndefined();
    expect(result.students[1].pin).toBe('77');
  });
});
