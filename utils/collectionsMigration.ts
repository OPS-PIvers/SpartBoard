import type { Dashboard } from '@/types';

/**
 * True if this Dashboard hasn't been migrated for the Collections feature
 * (i.e., `collectionId` is undefined). Boards with `collectionId === null`
 * are considered already migrated to "root level."
 */
export const needsCollectionMigration = (board: Dashboard): boolean => {
  return board.collectionId === undefined;
};

/**
 * Idempotent migration: seeds `collectionId: null` and `isPinned: false`
 * on a Board that lacks those fields. Returns the migrated Board (or the
 * original if no change was needed).
 *
 * Run on every Board load until cleaned up by a subsequent Firestore write.
 */
export const migrateBoardForCollections = (board: Dashboard): Dashboard => {
  if (!needsCollectionMigration(board) && board.isPinned !== undefined) {
    return board;
  }
  return {
    ...board,
    collectionId: board.collectionId ?? null,
    isPinned: board.isPinned ?? false,
  };
};
