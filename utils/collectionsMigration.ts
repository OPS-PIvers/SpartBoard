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
 * Idempotent migration: seeds `collectionId: null` and `isPinned: false`
 * on a Board that lacks those fields. Returns the migrated Board (or the
 * original if no change was needed).
 *
 * Run on every Board load until cleaned up by a subsequent Firestore write.
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
