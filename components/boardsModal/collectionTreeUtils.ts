import type { Collection } from '@/types';
import { flattenTree } from '@/utils/folderTree';

// Groups collections by the parent they show under, from the shared flatten (orphans and cycle members at root).
export const buildChildrenByParent = (
  collections: Collection[]
): Map<string | null, Collection[]> => {
  const m = new Map<string | null, Collection[]>();
  for (const { node, effectiveParentId } of flattenTree(
    collections,
    (c) => c.parentCollectionId
  )) {
    const bucket = m.get(effectiveParentId) ?? [];
    bucket.push(node);
    m.set(effectiveParentId, bucket);
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
