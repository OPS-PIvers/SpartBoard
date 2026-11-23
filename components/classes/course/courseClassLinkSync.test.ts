import { describe, expect, it } from 'vitest';
import type { Student } from '@/types';
import { planCourseClassLinkSync } from './courseClassLinkSync';

const student = (id: string, first: string, last: string): Student => ({
  id,
  firstName: first,
  lastName: last,
  pin: '01',
});
const cl = (sourcedId: string, givenName: string, familyName: string) => ({
  sourcedId,
  givenName,
  familyName,
  email: '',
});

describe('planCourseClassLinkSync', () => {
  it('merges each linked section from its own ClassLink class', () => {
    const plan = planCourseClassLinkSync(
      [
        {
          id: 'a',
          name: 'Period 1',
          classlinkClassId: 'c1',
          students: [student('s1', 'Ann', 'Lee')],
        },
        { id: 'b', name: 'Period 2', classlinkClassId: 'c2', students: [] },
      ],
      {
        classes: [],
        studentsByClass: {
          c1: [cl('x1', 'Ann', 'Lee'), cl('x2', 'Bo', 'Ng')],
          c2: [cl('x3', 'Cy', 'Ott')],
        },
      }
    );
    expect(plan.updates.map((u) => u.rosterId)).toEqual(['a', 'b']);
    expect(plan.updates[0].students).toHaveLength(2);
    expect(plan.updates[1].students).toHaveLength(1);
    expect(plan.added).toBe(2);
    expect(plan.unlinked).toEqual([]);
    expect(plan.notFound).toEqual([]);
  });

  it('skips sections never linked or missing from ClassLink, naming them', () => {
    const plan = planCourseClassLinkSync(
      [
        { id: 'a', name: 'Period 1', students: [] },
        { id: 'b', name: 'Period 2', classlinkClassId: 'gone', students: [] },
      ],
      { classes: [], studentsByClass: {} }
    );
    expect(plan.updates).toEqual([]);
    expect(plan.unlinked).toEqual(['Period 1']);
    expect(plan.notFound).toEqual(['Period 2']);
  });

  it('removes a linked student who left the section', () => {
    const plan = planCourseClassLinkSync(
      [
        {
          id: 'a',
          name: 'Period 9',
          classlinkClassId: 'c9',
          students: [
            { ...student('s1', 'Ann', 'Lee'), classLinkSourcedId: 'x1' },
            { ...student('s2', 'Bo', 'Ng'), classLinkSourcedId: 'x2' },
            { ...student('s3', 'Cy', 'Ott'), classLinkSourcedId: 'x3' },
          ],
        },
      ],
      {
        classes: [],
        studentsByClass: { c9: [cl('x1', 'Ann', 'Lee'), cl('x2', 'Bo', 'Ng')] },
      }
    );
    expect(plan.removed).toBe(1);
    expect(plan.updates[0].students.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(plan.removalSkipped).toEqual([]);
  });
});
