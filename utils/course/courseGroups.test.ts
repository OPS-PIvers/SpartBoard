import { describe, expect, it } from 'vitest';
import { courseForRoster, courseGroups } from './courseGroups';
import type { Course } from './contract';

const course = (id: string, rosterIds: string[]): Course => ({
  id,
  name: id,
  rosterIds,
  agenda: null,
  pinnedLinks: [],
  familyLink: null,
  linkId: `link-${id}`,
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 0,
  updatedAt: 0,
});

describe('courseGroups', () => {
  const rosters = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }];

  it('groups linked classes once, in roster order, and keeps the rest as Courses of one', () => {
    const eng = course('eng', ['p3', 'p1', 'gone']);
    expect(courseGroups([eng], rosters)).toEqual([
      { course: eng, rosters: [{ id: 'p1' }, { id: 'p3' }] },
      { course: null, rosters: [{ id: 'p2' }] },
      { course: null, rosters: [{ id: 'p4' }] },
    ]);
  });

  it('finds the Course holding a class', () => {
    const eng = course('eng', ['p1']);
    expect(courseForRoster([eng], 'p1')).toBe(eng);
    expect(courseForRoster([eng], 'p2')).toBeNull();
  });
});

describe('dropRosterRequest', () => {
  it('saves the Course without the class, or deletes a Course left empty', async () => {
    const { dropRosterRequest } = await import('./courseGroups');
    const eng = {
      ...course('eng', ['p1', 'p2']),
      familyLink: { shareId: 's', on: true },
    };
    expect(dropRosterRequest(eng, 'p1')).toEqual({
      action: 'save',
      course: {
        id: 'eng',
        name: 'eng',
        rosterIds: ['p2'],
        agenda: null,
        pinnedLinks: [],
        familyLinkOn: true,
      },
    });
    expect(dropRosterRequest(course('one', ['p1']), 'p1')).toEqual({
      action: 'delete',
      courseId: 'one',
    });
    expect(dropRosterRequest(eng, 'p9')).toBeNull();
  });
});
