import { describe, it, expect } from 'vitest';
import type { ProjectGroup } from '@/types';
import {
  boardClassIds,
  boardClassOptions,
  describeEvent,
  groupColorOf,
  relativeTime,
  resolveBoardClassId,
  reviewCells,
  rosterForClass,
  stepsWithWork,
} from './boardHelpers';
import { defaultGroupColor } from './projectSteps';

const steps = [
  { id: 's1', title: 'Research' },
  { id: 's2', title: 'Draft' },
];

describe('boardClassIds', () => {
  it('prefers the run classes', () => {
    expect(boardClassIds({ classIds: ['a', 'b'] }, [{ classId: 'c' }])).toEqual(
      ['a', 'b']
    );
  });

  it('derives classes from groups when the run has none (sub share)', () => {
    expect(
      boardClassIds(null, [
        { classId: 'b' },
        { classId: 'a' },
        { classId: 'b' },
      ])
    ).toEqual(['b', 'a']);
  });
});

describe('boardClassOptions', () => {
  const rosters = [{ id: 'r1', name: 'Period 1', classlinkClassId: 'a' }];

  it('labels from run names, then rosters, then Class N', () => {
    expect(
      boardClassOptions(['a', 'b', 'c'], { b: 'Period 2' }, rosters)
    ).toEqual([
      { id: 'a', label: 'Period 1' },
      { id: 'b', label: 'Period 2' },
      { id: 'c', label: 'Class 3' },
    ]);
  });

  it('ignores a blank run name', () => {
    expect(boardClassOptions(['a'], { a: '  ' }, rosters)[0].label).toBe(
      'Period 1'
    );
  });
});

describe('resolveBoardClassId', () => {
  it('keeps a saved class the run still has', () => {
    expect(resolveBoardClassId('b', ['a', 'b'])).toBe('b');
  });

  it('falls back to the first class', () => {
    expect(resolveBoardClassId('gone', ['a', 'b'])).toBe('a');
    expect(resolveBoardClassId(undefined, ['a'])).toBe('a');
  });

  it('is null with no classes', () => {
    expect(resolveBoardClassId('a', [])).toBeNull();
  });
});

describe('rosterForClass', () => {
  it('matches a hand-built roster by its local id', () => {
    const rosters = [
      { id: 'r1', name: 'One', classlinkClassId: 'a' },
      { id: 'r2', name: 'Club' },
    ];
    expect(rosterForClass(rosters, 'local:r2')?.id).toBe('r2');
    expect(rosterForClass(rosters, null)).toBeUndefined();
  });
});

describe('groupColorOf', () => {
  it('uses the stored color, else deals one by order', () => {
    expect(groupColorOf({ color: 'bg-rose-500', order: 0 })).toBe(
      'bg-rose-500'
    );
    expect(groupColorOf({ order: 2 })).toBe(defaultGroupColor(2));
  });
});

describe('reviewCells', () => {
  it('lists ready-for-review cells in row then step order', () => {
    const groups: Pick<ProjectGroup, 'id' | 'stepStates'>[] = [
      { id: 'g1', stepStates: { s2: 'readyForReview' } },
      {
        id: 'g2',
        stepStates: {
          s1: 'readyForReview' as const,
          s2: 'done' as const,
        },
      },
    ];
    expect(reviewCells(groups, steps)).toEqual([
      { groupId: 'g1', stepId: 's2' },
      { groupId: 'g2', stepId: 's1' },
    ]);
  });
});

describe('stepsWithWork', () => {
  it('collects tagged steps from links and uploads', () => {
    expect([
      ...stepsWithWork([{ stepId: 's1' }, {}], [{ stepId: 's2' }]),
    ]).toEqual(['s1', 's2']);
  });
});

describe('relativeTime', () => {
  const now = 10_000_000;
  it('reads like a feed', () => {
    expect(relativeTime(now - 5_000, now)).toBe('just now');
    expect(relativeTime(now - 120_000, now)).toBe('2m ago');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2d ago');
  });
});

describe('describeEvent', () => {
  const nameOf = (uid: string) => (uid === 'u1' ? 'Ada Lovelace' : undefined);

  it('describes a teacher step change', () => {
    expect(
      describeEvent(
        {
          actorRole: 'teacher',
          actorUid: 't',
          kind: 'stepState',
          stepId: 's1',
          to: 'done',
        },
        steps,
        nameOf
      )
    ).toBe("Teacher set 'Research' to Done");
  });

  it('names a student when known and falls back otherwise', () => {
    expect(
      describeEvent(
        {
          actorRole: 'student',
          actorUid: 'u1',
          kind: 'upload',
          detail: 'a.pdf',
        },
        steps,
        nameOf
      )
    ).toBe('Ada Lovelace uploaded a.pdf');
    expect(
      describeEvent(
        {
          actorRole: 'student',
          actorUid: 'u9',
          kind: 'workLink',
          stepId: 's2',
        },
        steps,
        nameOf
      )
    ).toBe("A student added a link for 'Draft'");
  });
});
