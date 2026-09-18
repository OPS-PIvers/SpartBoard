import { describe, it, expect } from 'vitest';
import { buildChildrenByParent } from '@/components/boardsModal/collectionTree';
import type { Collection } from '@/types';

const collection = (over: Partial<Collection>): Collection => ({
  id: 'x',
  name: 'x',
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
  ...over,
});

// Walk the map the same way CollectionTreeNode's recursion does, so the
// test exercises the actual traversal, not just the map's raw contents.
const collectAllReachable = (m: Map<string | null, Collection[]>): string[] => {
  const out: string[] = [];
  const walk = (parent: string | null) => {
    for (const c of m.get(parent) ?? []) {
      out.push(c.name);
      walk(c.id);
    }
  };
  walk(null);
  return out;
};

describe('buildChildrenByParent — orphaned subtree', () => {
  it('surfaces an orphaned collection and its whole subtree at root', () => {
    // Mirrors a partial deleteCollection failure: the parent doc is gone
    // but a descendant chunk didn't commit, leaving a dangling
    // parentCollectionId (same scenario as boardNavMenu.flattenCollections).
    const collections: Collection[] = [
      collection({
        id: 'a',
        name: 'Orphan Parent',
        parentCollectionId: 'deleted-parent',
      }),
      collection({ id: 'b', name: 'Orphan Child', parentCollectionId: 'a' }),
      collection({
        id: 'c',
        name: 'Orphan Grandchild',
        parentCollectionId: 'b',
      }),
    ];

    const m = buildChildrenByParent(collections);
    const reachable = collectAllReachable(m);

    expect(reachable).toContain('Orphan Parent');
    expect(reachable).toContain('Orphan Child');
    expect(reachable).toContain('Orphan Grandchild');
  });

  it('sorts multiple orphans sharing the same missing parent by order', () => {
    const collections: Collection[] = [
      collection({
        id: 'later',
        name: 'Later Orphan',
        parentCollectionId: 'deleted-parent',
        order: 5,
      }),
      collection({
        id: 'earlier',
        name: 'Earlier Orphan',
        parentCollectionId: 'deleted-parent',
        order: 1,
      }),
    ];

    const m = buildChildrenByParent(collections);
    expect((m.get(null) ?? []).map((c) => c.name)).toEqual([
      'Earlier Orphan',
      'Later Orphan',
    ]);
  });
});
