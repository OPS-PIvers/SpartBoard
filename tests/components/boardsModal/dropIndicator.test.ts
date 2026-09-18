import { describe, it, expect } from 'vitest';
import { siblingCollections } from '@/components/boardsModal/dropIndicator';
import type { Collection } from '@/types';

const collection = (over: Partial<Collection>): Collection => ({
  id: 'x',
  name: 'x',
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
  ...over,
});

describe('siblingCollections — orphan reachability', () => {
  it('includes a root-level orphan alongside real root collections', () => {
    const collections: Collection[] = [
      collection({ id: 'root', name: 'Root', parentCollectionId: null }),
      collection({
        id: 'orphan',
        name: 'Orphan',
        parentCollectionId: 'deleted-parent',
      }),
    ];

    const siblings = siblingCollections(collections, null);
    expect(siblings.map((c) => c.id).sort()).toEqual(['orphan', 'root']);
  });

  it('does not surface an orphan under a non-root parentId', () => {
    const collections: Collection[] = [
      collection({ id: 'a', name: 'A', parentCollectionId: 'parent' }),
      collection({
        id: 'orphan',
        name: 'Orphan',
        parentCollectionId: 'deleted-parent',
      }),
    ];

    expect(siblingCollections(collections, 'parent').map((c) => c.id)).toEqual([
      'a',
    ]);
  });

  it('does not promote a search-filtered nested match whose parent was filtered out', () => {
    const all: Collection[] = [
      collection({ id: 'science', name: 'Science', parentCollectionId: null }),
      collection({
        id: 'math',
        name: 'Math Homework',
        parentCollectionId: 'science',
      }),
    ];
    const searchFiltered = all.filter((c) =>
      c.name.toLowerCase().includes('math')
    );

    expect(siblingCollections(searchFiltered, null, all)).toEqual([]);
  });

  it('still surfaces a genuine orphan when the list is search-filtered', () => {
    const all: Collection[] = [
      collection({ id: 'science', name: 'Science', parentCollectionId: null }),
      collection({
        id: 'math',
        name: 'Math Homework',
        parentCollectionId: 'deleted-parent',
      }),
    ];
    const searchFiltered = all.filter((c) =>
      c.name.toLowerCase().includes('math')
    );

    expect(
      siblingCollections(searchFiltered, null, all).map((c) => c.id)
    ).toEqual(['math']);
  });
});
