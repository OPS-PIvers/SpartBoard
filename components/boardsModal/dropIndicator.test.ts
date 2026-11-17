import { describe, it, expect } from 'vitest';
import type { Collection, Dashboard } from '@/types';
import { boardsInView } from './dropIndicator';

const board = (id: string, collectionId?: string, order = 0) =>
  ({ id, name: id, collectionId, order }) as unknown as Dashboard;
const collections = [{ id: 'c1', name: 'Unit 1', order: 0 }] as Collection[];
const boards = [
  board('a', undefined, 2),
  board('b', 'c1', 1),
  board('c', 'gone', 0),
];
const ids = (list: Dashboard[]) => list.map((b) => b.id);

describe('boardsInView', () => {
  it('shows only uncollected boards at the top level', () => {
    expect(ids(boardsInView(boards, null, collections, false))).toEqual([
      'c',
      'a',
    ]);
  });

  it('shows every match when searching from the top level', () => {
    expect(ids(boardsInView(boards, null, collections, true))).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it("shows only an open Collection's own boards", () => {
    expect(ids(boardsInView(boards, 'c1', collections, false))).toEqual(['b']);
  });
});
