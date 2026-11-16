import { describe, it, expect } from 'vitest';
import { buildChildrenByParent } from './collectionTreeUtils';
import { flattenCollections } from '@/components/layout/boardNavMenu';
import type { Collection } from '@/types';

const col = (id: string, parent: string | null, order = 0): Collection => ({
  id,
  name: id,
  parentCollectionId: parent,
  order,
  createdAt: 1,
});

// a and b name each other as parent, as two racing tabs can leave them.
const cycle = [col('a', 'b', 0), col('b', 'a', 1), col('c', null, 2)];

describe('collection parent cycles', () => {
  it('flattenCollections still lists every member of a parent cycle', () => {
    const ids = flattenCollections(cycle).map((f) => f.c.id);
    expect(ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('buildChildrenByParent reaches every member of a cycle from the root without looping', () => {
    const m = buildChildrenByParent(cycle);
    const seen = new Set<string>();
    const walk = (parent: string | null) => {
      for (const k of m.get(parent) ?? []) {
        expect(seen.has(k.id)).toBe(false);
        seen.add(k.id);
        walk(k.id);
      }
    };
    walk(null);
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
  });
});
