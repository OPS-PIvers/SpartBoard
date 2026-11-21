import type { Collection } from '@/types';

// Groups collections by parent for O(1) child lookup; orphans (parent id doesn't resolve) surface at root, mirroring boardNavMenu.ts's flattenCollections.
export const buildChildrenByParent = (
  collections: Collection[]
): Map<string | null, Collection[]> => {
  const m = new Map<string | null, Collection[]>();
  for (const c of collections) {
    const bucket = m.get(c.parentCollectionId) ?? [];
    bucket.push(c);
    m.set(c.parentCollectionId, bucket);
  }

  const knownIds = new Set(collections.map((c) => c.id));
  for (const c of collections) {
    if (c.parentCollectionId == null || knownIds.has(c.parentCollectionId)) {
      continue;
    }
    const orphanBucket = m.get(c.parentCollectionId);
    if (orphanBucket) {
      const idx = orphanBucket.indexOf(c);
      if (idx !== -1) orphanBucket.splice(idx, 1);
    }
    const rootBucket = m.get(null) ?? [];
    rootBucket.push(c);
    m.set(null, rootBucket);
  }

  // Parent cycles (two-tab races) are unreachable from root; hoist one member per cycle to root.
  const reached = new Set<string>();
  const markFrom = (parent: string | null) => {
    for (const k of m.get(parent) ?? []) {
      if (reached.has(k.id)) continue;
      reached.add(k.id);
      markFrom(k.id);
    }
  };
  markFrom(null);
  for (const c of [...collections].sort((a, b) => a.order - b.order)) {
    if (reached.has(c.id)) continue;
    const bucket = m.get(c.parentCollectionId);
    const idx = bucket ? bucket.indexOf(c) : -1;
    if (idx !== -1) bucket?.splice(idx, 1);
    const rootBucket = m.get(null) ?? [];
    rootBucket.push(c);
    m.set(null, rootBucket);
    reached.add(c.id);
    markFrom(c.id);
  }

  for (const bucket of m.values()) {
    bucket.sort((a, b) => a.order - b.order);
  }
  return m;
};

// Search-narrows to matches plus their ancestors, so a matched descendant's real (non-matching) parent chain stays present and isn't misread as an orphan by buildChildrenByParent.
export const filterCollectionsBySearch = (
  collections: Collection[],
  searchTerm: string
): Collection[] => {
  if (!searchTerm) return collections;
  const byId = new Map(collections.map((c) => [c.id, c]));
  const keep = new Set<string>();
  for (const c of collections) {
    if (!c.name.toLowerCase().includes(searchTerm)) continue;
    keep.add(c.id);
    let parentId = c.parentCollectionId;
    while (parentId != null && !keep.has(parentId)) {
      keep.add(parentId);
      parentId = byId.get(parentId)?.parentCollectionId ?? null;
    }
  }
  return collections.filter((c) => keep.has(c.id));
};
