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
  session: { rosterIds: ['r1'], classIds: ['class-1'] },
  rosters: [cl],
  targets: {},
  byStudentUid: names,
  targetRefKeyByStudentUid: refs,
  lookupReady: true,
  today: '2026-11-15',
  responseName: (r: QuizResponse) =>
    (r as QuizResponse & { name?: string }).name ?? '',
};

describe('buildNotJoined', () => {
  it("marks students on today's absent list, not an older one", () => {
    const run = (date: string) =>
      buildNotJoined({
        ...base,
        rosters: [{ ...cl, absent: { date, studentIds: ['s1'] } }],
        responses: [],
      }).map((s) => [s.name, s.absent]);
    expect(run('2026-11-15')).toEqual([
      ['Ana Lee', true],
      ['Ben Lee', false],
      ['Cy Lee', false],
    ]);
    expect(run('2026-11-14')[0]).toEqual(['Ana Lee', false]);
  });

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

  it('leaves out skipped students', () => {
    const out = buildNotJoined({
      ...base,
      responses: [],
      targets: { excludedTargets: [{ kind: 'classlink', sourcedId: 'A' }] },
    });
    expect(out.map((s) => s.name)).toEqual(['Ben Lee', 'Cy Lee']);
  });

  it('holds back signed-in students whose class the lookup did not cover', () => {
    expect(
      buildNotJoined({
        ...base,
        session: { rosterIds: ['r1'], classIds: ['class-2'] },
        responses: [],
      })
    ).toEqual([]);
  });

  it('lists only targeted students on a per-student assignment', () => {
    const out = buildNotJoined({
      ...base,
      session: {
        rosterIds: ['r1'],
        classIds: ['class-1'],
        individualTargeting: true,
      },
      responses: [],
      targets: {
        targetMode: 'students',
        targetStudents: [{ kind: 'classlink', sourcedId: 'B' }],
      },
    });
    expect(out.map((s) => s.name)).toEqual(['Ben Lee']);
  });

  it('shows nobody until the assignment targeting is known', () => {
    expect(buildNotJoined({ ...base, targets: null, responses: [] })).toEqual(
      []
    );
  });

  it('matches by the class name saved at assign time after a rename', () => {
    const local = roster('r8', [student('p1', 'Dee', { pin: '01' })], {
      name: 'Renamed',
    });
    const out = buildNotJoined({
      ...base,
      session: { rosterIds: ['r8'], periodNames: ['Period 3'] },
      rosters: [local, roster('r9', [])],
      responses: [
        response({ studentUid: 'anon', pin: '01', classPeriod: 'Period 3' }),
      ],
    });
    expect(out).toEqual([]);
  });

  it('ignores absences when no date is given', () => {
    const out = buildNotJoined({
      ...base,
      today: '',
      rosters: [{ ...cl, absent: { date: '', studentIds: ['s1'] } }],
      responses: [],
    });
    expect(out.every((s) => !s.absent)).toBe(true);
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
        response({
          studentUid: 'lti',
          name: 'Eve  Lee',
        } as Partial<QuizResponse>),
      ],
    });
    expect(out.map((s) => [s.name, s.studentUid, s.key])).toEqual([
      ['Fay Lee', null, 'r2:p3'],
    ]);
  });

  it('lets one response by name stand for one student in its own class', () => {
    const p1 = roster('r4', [student('a', 'Sam')]);
    const p3 = roster('r5', [student('b', 'Sam'), student('c', 'Sam')]);
    const out = buildNotJoined({
      ...base,
      session: {
        rosterIds: ['r4', 'r5'],
        classPeriodByClassId: {},
      },
      rosters: [p1, p3],
      responses: [
        response({
          studentUid: 'lti',
          classPeriod: 'Class r5',
          name: 'Sam Lee',
        } as Partial<QuizResponse>),
      ],
    });
    expect(out.map((s) => s.key)).toEqual(['r4:a', 'r5:c']);
  });

  it('does not count a PIN joined in another class', () => {
    const a = roster('r6', [student('x', 'Ann', { pin: '07' })]);
    const b = roster('r7', [student('y', 'Bo', { pin: '07' })]);
    const out = buildNotJoined({
      ...base,
      session: { rosterIds: ['r6', 'r7'] },
      rosters: [a, b],
      responses: [
        response({ studentUid: 'anon', pin: '07', classPeriod: 'Class r6' }),
      ],
    });
    expect(out.map((s) => s.name)).toEqual(['Bo Lee']);
  });

  it('lists a student on two assigned rosters once', () => {
    const twin = roster('r3', [
      student('s9', 'Ana', { classLinkSourcedId: 'A' }),
    ]);
    const out = buildNotJoined({
      ...base,
      session: { rosterIds: ['r1', 'r3'], classIds: ['class-1'] },
      rosters: [cl, twin],
      responses: [],
    });
    expect(out.filter((s) => s.studentUid === 'uid-a')).toHaveLength(1);
  });
});
