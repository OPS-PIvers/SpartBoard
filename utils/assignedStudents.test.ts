import { describe, expect, it } from 'vitest';
import type { ClassRoster, Student } from '@/types';
import {
  namesByClassKey,
  pickedClassSizes,
  pickedGroups,
  pickedStudents,
  unnamedLabel,
} from './assignedStudents';

const student = (id: string, firstName: string, lastName: string): Student => ({
  id,
  firstName,
  lastName,
  pin: '01',
  classLinkSourcedId: id,
});

const roster = (
  id: string,
  name: string,
  students: Student[]
): ClassRoster => ({
  id,
  name,
  students,
  driveFileId: null,
  studentCount: 0,
  createdAt: 0,
});

const fail = (): never => {
  throw new Error('expected picked students');
};

const ref = (sourcedId: string) => ({ kind: 'classlink' as const, sourcedId });

const p1 = roster('r1', 'Period 1', [
  student('a', 'Zoe', 'Adams'),
  student('b', 'Ben', 'zhang'),
  student('c', 'Ann', 'Brooks'),
  student('m', 'Cher', ''),
]);
const p2 = roster('r2', 'Period 2', [
  student('d', 'Dev', 'Diaz'),
  student('a', 'Zoe', 'Adams'),
]);
const old = roster('r9', 'English 10', [student('e', 'Eli', 'Evans')]);

describe('pickedStudents', () => {
  it('is null for a class run', () => {
    expect(
      pickedStudents({ targetMode: 'class', targetStudents: [ref('a')] }, [p1])
    ).toBeNull();
  });

  it('groups picks by run class, Last, First, sorted by last name', () => {
    const picked = pickedStudents(
      {
        targetMode: 'students',
        targetStudents: [ref('b'), ref('a'), ref('c'), ref('m'), ref('d')],
        rosterIds: ['r1', 'r2'],
      },
      [p1, p2]
    );
    expect(picked?.count).toBe(5);
    expect(picked?.classes).toEqual([
      {
        rosterId: 'r1',
        label: 'Period 1',
        names: ['Adams, Zoe', 'Brooks, Ann', 'Cher', 'zhang, Ben'],
      },
      { rosterId: 'r2', label: 'Period 2', names: ['Diaz, Dev'] },
    ]);
  });

  it('lists a student in two run classes once, under the first', () => {
    const picked = pickedStudents(
      {
        targetMode: 'students',
        targetStudents: [ref('a')],
        rosterIds: ['r2', 'r1'],
      },
      [p1, p2]
    );
    expect(picked?.classes.map((c) => c.label)).toEqual(['Period 2']);
  });

  it('keeps a pick from a stale class list and counts one no list names', () => {
    const picked = pickedStudents(
      {
        targetMode: 'students',
        targetStudents: [ref('a'), ref('e'), ref('gone')],
        rosterIds: ['r1'],
      },
      [old, p1]
    );
    expect(picked?.elsewhere).toEqual(['Evans, Eli']);
    expect(picked?.unnamed).toBe(1);
    expect(pickedGroups(picked ?? fail()).map((g) => g.label)).toEqual([
      'Period 1',
      'Not in these classes',
    ]);
    expect(unnamedLabel(picked?.unnamed ?? 0)).toBe(
      '1 student not on your class lists'
    );
  });

  it('sizes each class by its picks, and a single line by every pick', () => {
    const picked =
      pickedStudents(
        {
          targetMode: 'students',
          targetStudents: [ref('a'), ref('c'), ref('d')],
          rosterIds: ['r1', 'r2'],
        },
        [p1, p2]
      ) ?? fail();
    const pa = { k1: { rosterId: 'r1' }, r2: {} };
    expect(namesByClassKey(picked, pa)).toEqual({
      k1: ['Adams, Zoe', 'Brooks, Ann'],
      r2: ['Diaz, Dev'],
    });
    expect(pickedClassSizes(picked, pa)).toEqual({ '': 3, k1: 2, r2: 1 });
    expect(namesByClassKey(picked, undefined)).toEqual({
      '': ['Adams, Zoe', 'Brooks, Ann', 'Diaz, Dev'],
    });
  });
});
