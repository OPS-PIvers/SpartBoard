import { describe, it, expect } from 'vitest';
import type { Student } from '@/types';
import { isGradebookRoster, joinGradebookRoster } from './gradebookRoster';

const student = (id: string, extra: Partial<Student> = {}): Student => ({
  id,
  firstName: id,
  lastName: '',
  pin: '',
  ...extra,
});

describe('isGradebookRoster', () => {
  it('admits ClassLink and test-class rosters only', () => {
    expect(isGradebookRoster({ classlinkClassId: 'c1' })).toBe(true);
    expect(isGradebookRoster({ testClassId: 'mock' })).toBe(true);
    expect(isGradebookRoster({})).toBe(false);
  });
});

describe('joinGradebookRoster', () => {
  it('joins ClassLink students by sourcedId and reports both kinds of gap', () => {
    const join = joinGradebookRoster(
      {
        students: [
          student('a', { classLinkSourcedId: 'sid-a' }),
          student('manual'),
          student('left', { classLinkSourcedId: 'sid-gone' }),
        ],
      },
      [
        { refKey: 'classlink:sid-a', studentUid: 'uid-a' },
        { refKey: 'classlink:sid-new', studentUid: 'uid-new' },
      ]
    );
    expect(join.studentUidByStudentId.get('a')).toBe('uid-a');
    expect(join.studentByUid.get('uid-a')?.id).toBe('a');
    expect(join.unmatchedStudentIds).toEqual(['manual', 'left']);
    expect(join.unrosteredUids).toEqual(['uid-new']);
  });

  it('joins test-class students by lowercased email', () => {
    const join = joinGradebookRoster(
      {
        testClassId: 'mock',
        students: [student('t', { email: 'Kid@School.edu' })],
      },
      [{ refKey: 'test:kid@school.edu', studentUid: 'uid-t' }]
    );
    expect(join.studentUidByStudentId.get('t')).toBe('uid-t');
    expect(join.unmatchedStudentIds).toEqual([]);
  });

  it('keeps the first row when two roster rows share one identity', () => {
    const join = joinGradebookRoster(
      {
        students: [
          student('first', { classLinkSourcedId: 'sid' }),
          student('dup', { classLinkSourcedId: 'sid' }),
        ],
      },
      [{ refKey: 'classlink:sid', studentUid: 'uid' }]
    );
    expect(join.studentByUid.get('uid')?.id).toBe('first');
    expect(join.unmatchedStudentIds).toEqual(['dup']);
  });
});
