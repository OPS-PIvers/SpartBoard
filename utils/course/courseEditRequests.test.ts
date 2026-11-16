import { describe, expect, it } from 'vitest';
import { courseEditRequests } from './courseEditRequests';
import { courseGroups } from './courseGroups';
import type { Course } from './contract';

const course = (id: string, rosterIds: string[], updatedAt = 1): Course => ({
  id,
  name: id,
  teacherName: 'T',
  rosterIds,
  agenda: null,
  pinnedLinks: [],
  familyLink: null,
  linkId: `l-${id}`,
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 0,
  updatedAt,
});

const rosters = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));

describe('courseEditRequests', () => {
  it('builds a new Course on the largest saved Course whose classes are all picked, so its Agenda carries over', () => {
    const courses = [course('solo', ['a'], 3), course('pair', ['c', 'd'], 5)];
    expect(
      courseEditRequests(courseGroups(courses, rosters), null, 'X', [
        'a',
        'c',
        'd',
      ])
    ).toEqual([
      {
        action: 'save',
        course: {
          id: 'pair',
          name: 'X',
          rosterIds: ['a', 'c', 'd'],
          expectedUpdatedAt: 5,
        },
      },
    ]);
  });

  it('never builds on a Course that would lose a class it did not pick', () => {
    const courses = [course('pair', ['c', 'd'])];
    expect(
      courseEditRequests(courseGroups(courses, rosters), null, 'X', ['a', 'c'])
    ).toEqual([
      { action: 'save', course: { name: 'X', rosterIds: ['a', 'c'] } },
    ]);
  });

  it('sends nothing when an edit changes nothing, and only an unlink for a removed class', () => {
    const c = course('k', ['a', 'b', 'c']);
    const groups = courseGroups([c], rosters);
    expect(courseEditRequests(groups, c, 'k', ['a', 'b', 'c'])).toEqual([]);
    expect(courseEditRequests(groups, c, 'k', ['a', 'b'])).toEqual([
      { action: 'unlink', courseId: 'k', rosterId: 'c' },
    ]);
  });
});
