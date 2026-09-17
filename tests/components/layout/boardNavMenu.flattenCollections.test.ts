import { describe, it, expect } from 'vitest';
import { flattenCollections } from '@/components/layout/boardNavMenu';
import type { Collection } from '@/types';

const collection = (over: Partial<Collection>): Collection => ({
  id: 'x',
  name: 'x',
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
  ...over,
});

describe('flattenCollections — orphaned subtree', () => {
  it('keeps every descendant of an orphaned collection reachable', () => {
    // Mirrors a partial deleteCollection failure: the parent doc is gone
    // (per useCollections.ts's own phase-tracked chunked deletes) but a
    // descendant chunk didn't commit, leaving a dangling parentCollectionId.
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

    const flat = flattenCollections(collections);
    const names = flat.map(({ c }) => c.name);

    expect(names).toContain('Orphan Parent');
    expect(names).toContain('Orphan Child');
    expect(names).toContain('Orphan Grandchild');
  });

  it('sorts multiple orphans sharing the same missing parent by order, not array position', () => {
    // Input array order is reversed relative to `order` to catch a fix that
    // walks `collections` directly instead of sorting orphan roots first.
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

    const flat = flattenCollections(collections);
    const names = flat.map(({ c }) => c.name);

    expect(names).toEqual(['Earlier Orphan', 'Later Orphan']);
  });
});
