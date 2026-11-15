import { describe, expect, it } from 'vitest';
import type { ClassRoster, QuizResponse, Student } from '@/types';
import { buildNotJoined } from './rosterNotJoined';

const student = (id: string, first: string, extra: Partial<Student> = {}) => ({
  id,
  firstName: first,
  lastName: 'Lee',
  pin: '',
  ...extra,
});

const roster = (
  id: string,
  students: Student[],
  extra: Partial<ClassRoster> = {}
): ClassRoster => ({
  id,
  name: `Class ${id}`,
  driveFileId: null,
  studentCount: students.length,
  createdAt: 1,
  students,
  ...extra,
});

const response = (extra: Partial<QuizResponse>) =>
  ({
    studentUid: 'x',
    status: 'joined',
    answers: [],
    joinedAt: 1,
    score: null,
    ...extra,
  }) as QuizResponse;

const cl = roster(
  'r1',
  [
    student('s1', 'Ana', { classLinkSourcedId: 'A' }),
    student('s2', 'Ben', { classLinkSourcedId: 'B' }),
    student('s3', 'Cy', { classLinkSourcedId: 'C' }),
  ],
  { classlinkClassId: 'class-1' }
);
const names = new Map([
  ['uid-a', { givenName: 'Ana', familyName: 'Lee' }],
  ['uid-b', { givenName: 'Ben', familyName: 'Lee' }],
  ['uid-c', { givenName: 'Cy', familyName: 'Lee' }],
]);
const refs = new Map([
  ['uid-a', 'classlink:A'],
  ['uid-b', 'classlink:B'],
  ['uid-c', 'classlink:C'],
]);

const base = {
  session: { rosterIds: ['r1'] },
  rosters: [cl],
  targets: null,
  byStudentUid: names,
  targetRefKeyByStudentUid: refs,
  lookupReady: true,
  joinedNames: [] as string[],
};

describe('buildNotJoined', () => {
  it('lists roster students with no response, keyed by their uid', () => {
    const out = buildNotJoined({
      ...base,
      responses: [response({ studentUid: 'uid-b' })],
    });
    expect(out.map((s) => [s.name, s.studentUid, s.periodKey])).toEqual([
      ['Ana Lee', 'uid-a', 'class-1'],
      ['Cy Lee', 'uid-c', 'class-1'],
    ]);
    expect(out[0].period).toBe('Class r1');
  });

  it('waits for the class lookup before listing ClassLink students', () => {
    expect(
      buildNotJoined({ ...base, lookupReady: false, responses: [] })
    ).toEqual([]);
  });

  it('leaves out skipped and removed students', () => {
    const out = buildNotJoined({
      ...base,
      responses: [],
      targets: {
        excludedTargets: [{ kind: 'classlink', sourcedId: 'A' }],
        removedStudentRefs: [{ kind: 'classlink', sourcedId: 'C' }],
      },
    });
    expect(out.map((s) => s.name)).toEqual(['Ben Lee']);
  });

  it('lists only targeted students on a per-student assignment', () => {
    const out = buildNotJoined({
      ...base,
      session: { rosterIds: ['r1'], individualTargeting: true },
      responses: [],
      targets: {
        targetMode: 'students',
        targetStudents: [{ kind: 'classlink', sourcedId: 'B' }],
      },
    });
    expect(out.map((s) => s.name)).toEqual(['Ben Lee']);
  });

  it('shows nobody for a per-student assignment whose targets are unknown', () => {
    expect(
      buildNotJoined({
        ...base,
        session: { rosterIds: ['r1'], individualTargeting: true },
        responses: [],
      })
    ).toEqual([]);
  });

  it('ignores rosters the session was not assigned to', () => {
    expect(
      buildNotJoined({
        ...base,
        session: { rosterIds: ['other'] },
        responses: [],
      })
    ).toEqual([]);
  });

  it('matches PIN students by PIN or by the name shown for their response', () => {
    const local = roster('r2', [
      student('p1', 'Dee', { pin: '01' }),
      student('p2', 'Eve', { pin: '02' }),
      student('p3', 'Fay', { pin: '03' }),
    ]);
    const out = buildNotJoined({
      ...base,
      session: { rosterIds: ['r2'] },
      rosters: [local],
      responses: [
        response({ studentUid: 'anon', pin: '01', classPeriod: 'Class r2' }),
      ],
      joinedNames: ['Eve  Lee'],
    });
    expect(out.map((s) => [s.name, s.studentUid, s.periodKey])).toEqual([
      ['Fay Lee', null, 'roster:r2'],
    ]);
  });

  it('lists a student on two assigned rosters once', () => {
    const twin = roster('r3', [
      student('s9', 'Ana', { classLinkSourcedId: 'A' }),
    ]);
    const out = buildNotJoined({
      ...base,
      session: { rosterIds: ['r1', 'r3'] },
      rosters: [cl, twin],
      responses: [],
    });
    expect(out.filter((s) => s.studentUid === 'uid-a')).toHaveLength(1);
  });
});
