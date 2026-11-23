import { describe, it, expect } from 'vitest';
import { buildChildrenByParent } from '@/components/boardsModal/collectionTreeUtils';
import { flattenCollections } from '@/components/layout/boardNavMenu';
import type { Collection } from '@/types';

const col = (id: string, parent: string | null, order: number): Collection => ({
  id,
  name: id,
  parentCollectionId: parent,
  order,
  createdAt: 0,
});

// a and b loop on each other; d hangs off the loop and sorts first.
const data = [col('d', 'a', 0), col('a', 'b', 1), col('b', 'a', 2)];

describe('parent cycle with a branch hanging off it', () => {
  it('buildChildrenByParent hoists a cycle member, not the branch', () => {
    const m = buildChildrenByParent(data);
    expect((m.get(null) ?? []).map((c) => c.id)).toEqual(['a']);
    expect((m.get('a') ?? []).map((c) => c.id)).toEqual(['d', 'b']);
  });

  it('flattenCollections keeps the branch under its parent', () => {
    const rows = flattenCollections(data).map((r) => [r.c.id, r.depth]);
    expect(rows).toEqual([
      ['a', 0],
      ['d', 1],
      ['b', 1],
    ]);
  });
});
