import { describe, it, expect } from 'vitest';
import type { ProjectGroup, Student } from '@/types';
import {
  buildGroupCommit,
  draftFromGroups,
  moveMember,
  nextGroupName,
  spreadUnassigned,
  unassignedStudents,
  type GroupDraftContext,
} from './groupDraft';

const student = (id: string, sourcedId?: string): Student => ({
  id,
  firstName: id.toUpperCase(),
  lastName: 'X',
  pin: '01',
  ...(sourcedId ? { classLinkSourcedId: sourcedId } : {}),
});

const students = [
  student('ada', 'sid-ada'),
  student('bo', 'sid-bo'),
  student('cy', 'sid-cy'),
  student('dee'),
];

const ctx: GroupDraftContext = {
  studentIdByUid: new Map([
    ['uid-ada', 'ada'],
    ['uid-bo', 'bo'],
  ]),
  studentsById: new Map(students.map((s) => [s.id, s])),
  testClass: false,
};

const stored = (
  id: string,
  memberUids: string[],
  order: number
): ProjectGroup => ({
  id,
  name: `Group ${order + 1}`,
  classId: 'class-a',
  memberUids,
  order,
  stepStates: {},
  needsSupport: false,
  workLinks: [],
  updatedAt: 1,
});

const original = draftFromGroups([
  stored('g2', ['uid-bo', 'uid-ghost'], 1),
  stored('g1', ['uid-ada'], 0),
]);

describe('group draft', () => {
  it('orders groups as the board does', () => {
    expect(original.map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('lists only signed-in students outside every group', () => {
    expect(
      unassignedStudents(original, students, ctx).map((s) => s.id)
    ).toEqual(['cy']);
  });

  it('commits nothing when nothing changed', () => {
    expect(buildGroupCommit(original, original, 'class-a', ctx)).toEqual({
      entries: [],
      deleteGroupIds: [],
    });
  });

  it('sends both groups when a student moves between them', () => {
    const moved = moveMember(original, { uid: 'uid-ada' }, 'g2', ctx);
    const { entries } = buildGroupCommit(original, moved, 'class-a', ctx);
    expect(entries).toEqual([
      {
        id: 'g1',
        name: 'Group 1',
        classId: 'class-a',
        order: 0,
        classLinkSourcedIds: [],
      },
      {
        id: 'g2',
        name: 'Group 2',
        classId: 'class-a',
        order: 1,
        classLinkSourcedIds: ['sid-bo', 'sid-ada'],
        keepMemberUids: ['uid-ghost'],
      },
    ]);
  });

  it('treats a stored uid and the same roster student as one member', () => {
    const moved = moveMember(original, { studentId: 'ada' }, null, ctx);
    expect(moved[0].members).toEqual([]);
  });

  it('adds an ungrouped student and renames a group', () => {
    let draft = moveMember(original, { studentId: 'cy' }, 'g1', ctx);
    draft = draft.map((g) => (g.id === 'g1' ? { ...g, name: ' Otters ' } : g));
    const { entries } = buildGroupCommit(original, draft, 'class-a', ctx);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'g1',
      name: 'Otters',
      classLinkSourcedIds: ['sid-ada', 'sid-cy'],
    });
  });

  it('deletes a removed group and renumbers the ones after it', () => {
    const draft = original.filter((g) => g.id !== 'g1');
    const commit = buildGroupCommit(original, draft, 'class-a', ctx);
    expect(commit.deleteGroupIds).toEqual(['g1']);
    expect(commit.entries).toEqual([
      expect.objectContaining({ id: 'g2', order: 0 }),
    ]);
  });

  it('writes a new empty group', () => {
    const draft = [
      ...original,
      { id: 'g3', name: nextGroupName(original), members: [], isNew: true },
    ];
    expect(buildGroupCommit(original, draft, 'class-a', ctx).entries).toEqual([
      {
        id: 'g3',
        name: 'Group 3',
        classId: 'class-a',
        order: 2,
        classLinkSourcedIds: [],
      },
    ]);
  });

  it('skips a group name already taken', () => {
    const draft = [{ ...original[0], name: 'Group 3' }, original[1]];
    expect(nextGroupName(draft)).toBe('Group 4');
  });

  it('deals ungrouped students into the smallest group first', () => {
    const spread = spreadUnassigned(original, [student('cy', 'sid-cy')]);
    expect(spread[0].members).toEqual([
      { uid: 'uid-ada' },
      { studentId: 'cy' },
    ]);
    expect(spread[1].members).toHaveLength(2);
  });

  it('sends test-class students by email', () => {
    const kid = { ...student('kid'), email: 'Kid@School.org' };
    const testCtx: GroupDraftContext = {
      studentIdByUid: new Map(),
      studentsById: new Map([[kid.id, kid]]),
      testClass: true,
    };
    expect(unassignedStudents([], [kid], testCtx)).toEqual([kid]);
    const draft = [
      {
        id: 'g1',
        name: 'Group 1',
        members: [{ studentId: 'kid' }],
        isNew: true,
      },
    ];
    expect(
      buildGroupCommit([], draft, 'mock-class', testCtx).entries[0]
    ).toMatchObject({
      classLinkSourcedIds: [],
      testEmails: ['kid@school.org'],
    });
  });
});
