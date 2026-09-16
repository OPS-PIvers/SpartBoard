import { describe, it, expect, vi } from 'vitest';
import {
  parseDndId,
  resolveDropTarget,
} from '@/components/boardsModal/useBoardsModalDnd';

vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));

const rect = { left: 100, top: 100, width: 200, height: 40 };
const at = (id: string, x: number, y = 120) => ({
  id,
  data: { pointer: { x, y }, rect },
});

const parents: Record<string, string | null> = {
  a: null,
  b: null,
  child: 'a',
};
const parentOf = (id: string) => parents[id] ?? null;

describe('parseDndId', () => {
  it('distinguishes grid cards, tree rows and the root', () => {
    expect(parseDndId('board:x')).toEqual({
      kind: 'board',
      id: 'x',
      surface: 'grid',
    });
    expect(parseDndId('collection:x').surface).toBe('grid');
    expect(parseDndId('tree:x')).toEqual({
      kind: 'collection',
      id: 'x',
      surface: 'tree',
    });
    expect(parseDndId('collection:root').surface).toBe('root');
  });
});

describe('resolveDropTarget', () => {
  it('reorders boards by which half of the target card the pointer is over', () => {
    expect(resolveDropTarget('board:1', at('board:2', 150), parentOf)).toEqual({
      id: 'board:2',
      mode: 'before',
    });
    expect(resolveDropTarget('board:1', at('board:2', 250), parentOf)).toEqual({
      id: 'board:2',
      mode: 'after',
    });
  });

  it('files a board into any Collection target', () => {
    expect(
      resolveDropTarget('board:1', at('collection:a', 110), parentOf)
    ).toEqual({ id: 'collection:a', mode: 'into' });
    expect(resolveDropTarget('board:1', at('tree:a', 200), parentOf)).toEqual({
      id: 'tree:a',
      mode: 'into',
    });
  });

  it('ignores a board dropped on itself', () => {
    expect(
      resolveDropTarget('board:1', at('board:1', 150), parentOf)
    ).toBeNull();
  });

  it('reorders sibling Collections at the card edges and nests in the middle', () => {
    expect(
      resolveDropTarget('collection:b', at('collection:a', 120), parentOf)
    ).toEqual({ id: 'collection:a', mode: 'before' });
    expect(
      resolveDropTarget('collection:b', at('collection:a', 290), parentOf)
    ).toEqual({ id: 'collection:a', mode: 'after' });
    expect(
      resolveDropTarget('collection:b', at('collection:a', 200), parentOf)
    ).toEqual({ id: 'collection:a', mode: 'into' });
  });

  it('uses vertical edges for tree rows', () => {
    expect(
      resolveDropTarget('tree:b', at('tree:a', 200, 102), parentOf)
    ).toEqual({ id: 'tree:a', mode: 'before' });
    expect(
      resolveDropTarget('tree:b', at('tree:a', 200, 138), parentOf)
    ).toEqual({ id: 'tree:a', mode: 'after' });
  });

  it('only nests a Collection that is not a sibling of the target', () => {
    expect(
      resolveDropTarget('collection:child', at('collection:b', 105), parentOf)
    ).toEqual({ id: 'collection:b', mode: 'into' });
  });

  it('never drops a Collection onto a board', () => {
    expect(
      resolveDropTarget('collection:a', at('board:1', 150), parentOf)
    ).toBeNull();
  });
});
