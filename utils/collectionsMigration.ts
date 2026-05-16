import type { Dashboard } from '@/types';

/**
 * True if this Dashboard hasn't been fully migrated for the Collections
 * feature — either `collectionId` or `isPinned` is undefined. Boards where
 * both fields are set (including `collectionId: null, isPinned: false`) are
 * considered already migrated.
 */
export const needsCollectionMigration = (board: Dashboard): boolean => {
  return board.collectionId === undefined || board.isPinned === undefined;
};

/**
 * Idempotent read-time normalization: seeds `collectionId: null` and
 * `isPinned: false` on a Board that lacks those fields. Returns the migrated
 * Board (or the original if no change was needed).
 *
 * This is a READ-TIME, IN-MEMORY normalization only — it does NOT write back
 * to Firestore. Legacy Board docs in Firestore that pre-date the Collections
 * feature will still be missing these fields until the document is otherwise
 * saved (widget update, rename, etc.), at which point the full normalized
 * shape will be persisted via the regular `saveDashboard` path.
 *
 * Practical implication: queries like `where('collectionId', '==', null)`
 * will NOT match legacy docs (Firestore treats "missing field" and "null
 * field" as distinct in equality comparisons). Code that needs to find
 * unfoldered Boards should rely on the read-time normalized in-memory list
 * rather than issuing such a query directly. The current usage in
 * `useCollections.deleteCollection` queries by specific non-null
 * `collectionId` values, which is unaffected by this caveat.
 */
export const migrateBoardForCollections = (board: Dashboard): Dashboard => {
  if (!needsCollectionMigration(board)) {
    return board;
  }
  return {
    ...board,
    collectionId: board.collectionId ?? null,
    isPinned: board.isPinned ?? false,
  };
};
