import { describe, expect, it } from 'vitest';
import type { ClassRoster } from '@/types';
import {
  paperSelectedStudentIds,
  paperStudentRef,
  pickedPaperRosters,
} from '@/utils/paperAssignClasses';

const student = (id: string, sso: boolean) => ({
  id,
  firstName: id,
  lastName: 'S',
  pin: id,
  ...(sso ? { classLinkSourcedId: `SID-${id}` } : {}),
});

const ROSTERS: ClassRoster[] = [
  {
    id: 'c1',
    name: 'Period 1',
    driveFileId: null,
    studentCount: 3,
    createdAt: 0,
    students: [student('a', true), student('b', true), student('d', false)],
  },
  {
    id: 'c2',
    name: 'Period 2',
    driveFileId: null,
    studentCount: 1,
    createdAt: 0,
    students: [student('e', true)],
  },
  {
    id: 'c3',
    name: 'Broken',
    driveFileId: null,
    studentCount: 0,
    createdAt: 0,
    students: [],
    loadError: 'network error',
  },
];

describe('paperSelectedStudentIds', () => {
  it('sends every student of a class with no picks', () => {
    const out = paperSelectedStudentIds(
      { classIds: ['c1', 'c2'], studentsByClass: {} },
      ROSTERS
    );
    expect([...out.c1]).toEqual(['a', 'b', 'd']);
    expect([...out.c2]).toEqual(['e']);
  });

  it('narrows to picked students, including one without a sign-in', () => {
    const c1 = ROSTERS[0];
    const out = paperSelectedStudentIds(
      {
        classIds: ['c1'],
        studentsByClass: {
          c1: [
            paperStudentRef(c1.students[0], c1),
            paperStudentRef(c1.students[2], c1),
          ],
        },
      },
      ROSTERS
    );
    expect([...out.c1]).toEqual(['a', 'd']);
  });

  it('skips classes that failed to load or are not picked', () => {
    const value = { classIds: ['c1', 'c3'], studentsByClass: {} };
    expect(Object.keys(paperSelectedStudentIds(value, ROSTERS))).toEqual([
      'c1',
    ]);
    expect(pickedPaperRosters(value, ROSTERS).map((r) => r.id)).toEqual(['c1']);
  });

  it('gives a student without a sign-in a ref unique to their class', () => {
    const c1 = ROSTERS[0];
    expect(paperStudentRef(c1.students[2], c1)).toEqual({
      kind: 'test',
      email: 'paper:c1:d',
    });
  });
});
