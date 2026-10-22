// Pure helpers for importing a Synced / View-Only shared collection (docs/plans/COLLECTION_SHARING.md slice 3).

import type {
  LinkedCollection,
  LinkedCollectionBoard,
  LinkedCollectionSection,
  SharedBoardIntendedMode,
} from '@/types';

/** Recipient landing route for a Synced / View-Only collection link. */
export const LINKED_COLLECTION_SHARE_PREFIX = '/share/collection/';

/** The link id in a `/share/collection/{linkId}` path, or null. */
export const parseLinkedCollectionPath = (path: string): string | null => {
  if (!path.startsWith(LINKED_COLLECTION_SHARE_PREFIX)) return null;
  const id = path.slice(LINKED_COLLECTION_SHARE_PREFIX.length).split('/')[0];
  if (!id) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return null;
  }
};

/** Trust rule: a listed share is only imported when its own doc names this link and mode. */
export const sharedBoardBelongsToLink = (
  board: {
    linkedCollectionId?: string;
    intendedMode?: SharedBoardIntendedMode;
  },
  link: Pick<LinkedCollection, 'linkId' | 'mode'>
): boolean =>
  board.linkedCollectionId === link.linkId && board.intendedMode === link.mode;

/** Board entries without duplicate share ids, in display order. */
export const uniqueLinkedBoards = (
  boards: LinkedCollectionBoard[]
): LinkedCollectionBoard[] => {
  const seen = new Set<string>();
  return [...boards]
    .sort((a, b) => a.order - b.order)
    .filter((b) => {
      if (!b.shareId || seen.has(b.shareId)) return false;
      seen.add(b.shareId);
      return true;
    });
};

/** Sections ordered so every parent comes before its children; orphans and cycles land at the top level. */
export const orderSectionsParentsFirst = (
  sections: LinkedCollectionSection[]
): LinkedCollectionSection[] => {
  const byId = new Map<string, LinkedCollectionSection>();
  for (const s of sections) if (s.id && !byId.has(s.id)) byId.set(s.id, s);
  const unique = [...byId.values()].sort((a, b) => a.order - b.order);

  const placed = new Set<string>();
  const result: LinkedCollectionSection[] = [];
  const place = (parentId: string | null) => {
    for (const s of unique) {
      if (placed.has(s.id) || s.parentId !== parentId) continue;
      placed.add(s.id);
      result.push(s);
      place(s.id);
    }
  };
  place(null);
  // Missing parents and cycles: re-root each unplaced section so nothing is dropped.
  for (const s of unique) {
    if (placed.has(s.id)) continue;
    placed.add(s.id);
    result.push({ ...s, parentId: null });
    place(s.id);
  }
  return result;
};
