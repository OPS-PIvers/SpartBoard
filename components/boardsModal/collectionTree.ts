import type { Collection } from '@/types';

/**
 * Group collections by parent for O(1) child lookup during recursive render.
 * Orphans (parent id doesn't resolve, e.g. a partial deleteCollection
 * failure) are surfaced at root instead of silently vanishing along with
 * their whole subtree. Mirrors flattenCollections in boardNavMenu.ts and
 * flattenFolders in FolderPickerPopover.tsx.
 */
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

  for (const bucket of m.values()) {
    bucket.sort((a, b) => a.order - b.order);
  }
  return m;
};
