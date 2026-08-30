import { describe, it, expect } from 'vitest';
import { collectDescendantIds } from './folderTree';

interface Node {
  id: string;
  parentId: string | null;
}

const getParentId = (n: Node) => n.parentId;

describe('collectDescendantIds', () => {
  it('collects children and grandchildren, excluding the root', () => {
    const nodes: Node[] = [
      { id: 'root', parentId: null },
      { id: 'a', parentId: 'root' },
      { id: 'b', parentId: 'root' },
      { id: 'a1', parentId: 'a' },
      { id: 'other', parentId: null },
    ];
    const result = collectDescendantIds('root', nodes, getParentId);
    expect(new Set(result)).toEqual(new Set(['a', 'b', 'a1']));
    expect(result).not.toContain('other');
    expect(result).not.toContain('root');
  });

  it('returns an empty array for a leaf node', () => {
    const nodes: Node[] = [{ id: 'root', parentId: null }];
    expect(collectDescendantIds('root', nodes, getParentId)).toEqual([]);
  });

  // Regression: a concurrent move from two tabs/devices can each pass their
  // own client-side isDescendantOrSelf check against stale state and still
  // land a mutual cycle once both writes commit (A's parent -> B, B's parent
  // -> A). Deleting either node must not hang/crash the whole tree walk.
  it('terminates on a cyclic parent graph instead of recursing forever', () => {
    const nodes: Node[] = [
      { id: 'A', parentId: 'B' },
      { id: 'B', parentId: 'A' },
    ];
    let result: string[] = [];
    expect(() => {
      result = collectDescendantIds('A', nodes, getParentId);
    }).not.toThrow();
    expect(result).toEqual(['B']);
  });

  it('terminates on a longer cycle that loops back to the root', () => {
    const nodes: Node[] = [
      { id: 'A', parentId: 'C' },
      { id: 'B', parentId: 'A' },
      { id: 'C', parentId: 'B' },
    ];
    let result: string[] = [];
    expect(() => {
      result = collectDescendantIds('A', nodes, getParentId);
    }).not.toThrow();
    expect(new Set(result)).toEqual(new Set(['B', 'C']));
  });
});
