/**
 * useFolders — personal library folder management.
 *
 * Thin wrapper over `useFolderTree` binding it to
 * `/users/{userId}/{widget}_folders` and the matching item collection.
 * See `useFolderTree.ts` for the shared implementation and `types.ts`
 * ("Library folders" section) for the schema.
 *
 * One folders collection per widget — folders never cross widgets. The
 * `widget` argument selects which collection this hook binds to via
 * `folderCollectionName()` below.
 */

import { useMemo } from 'react';
import type { LibraryFolderWidget } from '@/types';
import { useFolderTree } from './useFolderTree';
import type { UseFoldersResult } from './useFolderTree';

export type { DeleteFolderMode, UseFoldersResult } from './useFolderTree';

/**
 * Map a `LibraryFolderWidget` to its Firestore subcollection name.
 * Exported so internal writes + any admin tooling use a single source of
 * truth.
 */
export const folderCollectionName = (widget: LibraryFolderWidget): string => {
  switch (widget) {
    case 'quiz':
      return 'quiz_folders';
    case 'question_bank':
      return 'question_bank_folders';
    case 'video_activity':
      return 'video_activity_folders';
    case 'guided_learning':
      return 'guided_learning_folders';
    case 'miniapp':
      return 'miniapp_folders';
  }
};

/**
 * Map a `LibraryFolderWidget` to the Firestore collection name holding the
 * ITEMS (quizzes, activities, sets, miniapps). Used by `moveItem` to update
 * the `folderId` field on an item's metadata doc.
 */
const itemCollectionName = (widget: LibraryFolderWidget): string => {
  switch (widget) {
    case 'quiz':
      return 'quizzes';
    case 'question_bank':
      return 'question_banks';
    case 'video_activity':
      return 'video_activities';
    case 'guided_learning':
      return 'guided_learning';
    case 'miniapp':
      return 'miniapps';
  }
};

export const useFolders = (
  userId: string | undefined,
  widget: LibraryFolderWidget
): UseFoldersResult =>
  useFolderTree(
    useMemo(
      () => ({
        folderPath: userId
          ? ['users', userId, folderCollectionName(widget)]
          : null,
        itemPaths: userId
          ? [['users', userId, itemCollectionName(widget)]]
          : [],
        logContext: { userId, widget },
      }),
      [userId, widget]
    )
  );
