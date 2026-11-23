import { describe, it, expect } from 'vitest';
import type { ClassRoster, QuizResponse } from '@/types';
import { buildPrintSeats } from '@/components/widgets/QuizWidget/components/monitor/printSeats';
import type { NotJoinedStudent } from '@/components/widgets/QuizWidget/components/monitor/rosterNotJoined';

const roster = (
  id: string,
  name: string,
  students: Partial<ClassRoster['students'][number]>[]
): ClassRoster =>
  ({
    id,
    name,
    students: students.map((s, i) => ({
      id: `s${i}`,
      firstName: 'F',
      lastName: 'L',
      pin: '',
      ...s,
    })),
  }) as unknown as ClassRoster;

const joined = (key: string, r: Partial<QuizResponse>) => ({
  key,
  name: key,
  response: r as Pick<QuizResponse, 'studentUid' | 'pin' | 'classPeriod'>,
});

describe('buildPrintSeats', () => {
  const p1 = roster('r1', 'Period 1', [
    { id: 'a', classLinkSourcedId: 'cl-a' },
    { id: 'b', pin: '0042' },
  ]);
  const p2 = roster('r2', 'Period 2', [{ id: 'c', pin: '42' }]);
  const other = roster('r3', 'Co-teacher', [
    { id: 'z', classLinkSourcedId: 'cl-z' },
  ]);

  it('matches signed-in, PIN and not-joined students to the session rosters', () => {
    const notJoined: NotJoinedStudent[] = [
      {
        key: 'r2:c',
        name: 'Casey',
        studentUid: null,
        period: 'Period 2',
        periodKey: null,
        absent: false,
        rosterId: 'r2',
        studentId: 'c',
        onPaper: false,
      },
    ];
    const seats = buildPrintSeats({
      session: { rosterIds: ['r1', 'r2'] },
      rosters: [p1, p2, other],
      joined: [
        joined('uid-a', { studentUid: 'uid-a' }),
        joined('pin-1', {
          studentUid: 'anon',
          pin: '42',
          classPeriod: 'Period 1',
        }),
        joined('uid-z', { studentUid: 'uid-z' }),
      ],
      notJoined,
      targetRefKeyByStudentUid: new Map([
        ['uid-a', 'classlink:cl-a'],
        ['uid-z', 'classlink:cl-z'],
      ]),
    });
    expect(seats.get('uid-a')).toMatchObject({
      rosterId: 'r1',
      studentId: 'a',
      refKey: 'classlink:cl-a',
      studentUid: 'uid-a',
    });
    // A dropped leading zero still matches, in the response's own class.
    expect(seats.get('pin-1')).toMatchObject({
      rosterId: 'r1',
      studentId: 'b',
      refKey: null,
      studentUid: null,
    });
    // Another teacher's roster never matches.
    expect(seats.has('uid-z')).toBe(false);
    expect(seats.get('r2:c')).toMatchObject({ rosterId: 'r2', studentId: 'c' });
  });
});
