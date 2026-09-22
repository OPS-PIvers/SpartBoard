import { describe, it, expect } from 'vitest';
import {
  boardWalkIndex,
  collectShareRosterIds,
  flattenSharedCollection,
  landingBoardId,
  singleBoardTree,
} from '@/utils/subShareSnapshot';
import type { Collection, Dashboard } from '@/types';

const coll = (
  id: string,
  parentCollectionId: string | null,
  order = 0,
  name = id
): Collection => ({
  id,
  name,
  parentCollectionId,
  order,
  createdAt: 0,
});

const board = (id: string, collectionId: string | null, order = 0): Dashboard =>
  ({
    id,
    name: `Board ${id}`,
    background: 'bg-slate-800',
    widgets: [],
    createdAt: 0,
    order,
    collectionId,
  }) as Dashboard;

describe('flattenSharedCollection', () => {
  // Monday (2 boards) and Tuesday (1) under a Week root that has one of its own.
  const week = coll('week', null, 0, 'Week');
  const monday = coll('mon', 'week', 0, 'Monday');
  const tuesday = coll('tue', 'week', 1, 'Tuesday');
  const collections = [week, monday, tuesday];
  const boards = [
    board('intro', 'week', 0),
    board('m2', 'mon', 1),
    board('m1', 'mon', 0),
    board('t1', 'tue', 0),
    board('elsewhere', 'other', 0),
  ];

  it('walks the root first, then each sub-collection in order', () => {
    const tree = flattenSharedCollection(week, collections, boards);
    expect(tree.boards.map((b) => b.id)).toEqual(['intro', 'm1', 'm2', 't1']);
    expect(tree.boards.map((b) => b.order)).toEqual([0, 1, 2, 3]);
    expect(tree.orderedBoards.map((b) => b.id)).toEqual(
      tree.boards.map((b) => b.id)
    );
  });

  it('names one section per collection, root first', () => {
    const tree = flattenSharedCollection(week, collections, boards);
    expect(tree.sections.map((s) => s.name)).toEqual([
      'Week',
      'Monday',
      'Tuesday',
    ]);
    expect(tree.boards.find((b) => b.id === 't1')?.sectionId).toBe('tue');
  });

  it('carries the board names the sub will see', () => {
    const tree = flattenSharedCollection(week, collections, boards);
    expect(tree.boards.find((b) => b.id === 'm1')?.name).toBe('Board m1');
  });

  it('leaves out boards in other collections', () => {
    const tree = flattenSharedCollection(week, collections, boards);
    expect(tree.boards.some((b) => b.id === 'elsewhere')).toBe(false);
  });

  it('keeps a section with no boards, so the sub sees the empty day', () => {
    const tree = flattenSharedCollection(week, collections, [
      board('intro', 'week', 0),
    ]);
    expect(tree.sections).toHaveLength(3);
    expect(tree.boards).toHaveLength(1);
  });

  it('terminates on a parent cycle instead of hanging the share', () => {
    const a = coll('a', 'b');
    const b = coll('b', 'a');
    const tree = flattenSharedCollection(a, [a, b], [board('x', 'b', 0)]);
    expect(tree.sections.map((s) => s.id)).toEqual(['a', 'b']);
    expect(tree.boards.map((b2) => b2.id)).toEqual(['x']);
  });
});

describe('singleBoardTree', () => {
  it('is a one-section, one-board share', () => {
    const tree = singleBoardTree(board('solo', null));
    expect(tree.sections).toEqual([{ id: 'solo', name: 'Board solo' }]);
    expect(tree.boards).toEqual([
      { id: 'solo', name: 'Board solo', sectionId: 'solo', order: 0 },
    ]);
    expect(tree.orderedBoards).toHaveLength(1);
  });
});

describe('collectShareRosterIds', () => {
  const withConfig = (config: Record<string, unknown>): Dashboard =>
    ({
      ...board('b', null),
      widgets: [{ id: 'w1', type: 'quiz', position: { x: 0, y: 0 }, config }],
    }) as unknown as Dashboard;

  it('always includes the active roster', () => {
    expect(collectShareRosterIds([withConfig({})], 'active-1')).toEqual([
      'active-1',
    ]);
  });

  it('collects rosters remembered by the quiz and activity pickers', () => {
    const ids = collectShareRosterIds(
      [
        withConfig({
          lastRosterIdsByQuizId: { q1: ['r1', 'r2'], q2: ['r2'] },
          lastRosterIdsBySetId: { s1: ['r3'] },
          unrelated: { x: ['not-a-roster'] },
        }),
      ],
      'active-1'
    );
    expect([...ids].sort()).toEqual(['active-1', 'r1', 'r2', 'r3']);
  });

  it('holds up with no active roster and junk in the config', () => {
    expect(
      collectShareRosterIds(
        [
          withConfig({
            lastRosterIdsByQuizId: null,
            lastRosterIdsBySetId: { s1: 'not-a-list', s2: ['', 'r9'] },
          }),
        ],
        null
      )
    ).toEqual(['r9']);
  });
});

describe('boardWalkIndex / landingBoardId', () => {
  const entries = [
    { id: 'a', name: 'A', sectionId: 's', order: 0 },
    { id: 'b', name: 'B', sectionId: 's', order: 1 },
  ];

  it('finds a board position and reports -1 for one not in the share', () => {
    expect(boardWalkIndex(entries, 'b')).toBe(1);
    expect(boardWalkIndex(entries, 'nope')).toBe(-1);
    expect(boardWalkIndex(undefined, 'a')).toBe(-1);
  });

  it('lands on the collection default when it is in the share', () => {
    expect(landingBoardId(entries, ['a', 'b'], 'b')).toBe('b');
  });

  it('falls back to the first board when the default is gone', () => {
    expect(landingBoardId(entries, ['a', 'b'], 'deleted')).toBe('a');
  });

  it('reads a pre-v2 share from boardIds alone', () => {
    expect(landingBoardId(undefined, ['x', 'y'])).toBe('x');
    expect(landingBoardId(undefined, ['x', 'y'], 'y')).toBe('y');
  });
});
