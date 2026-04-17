/**
 * useFolders — library folder management (Wave 3).
 *
 * **SHELL ONLY.** This file defines the hook signature and return-type
 * contract that Wave 3-B will implement. All operations are currently
 * no-ops so the module can compile and type-check across the codebase
 * without shipping any behavior change. The real implementation
 * (Firestore CRUD, real-time listener, optimistic tree state) lands in
 * Wave 3-B on top of this shape.
 *
 * Schema recap (see `types.ts` "Library folders (Wave 3)" section):
 *   /users/{userId}/{widget}_folders/{folderId}
 *     => { id, name, parentId: string | null, order: number,
 *          createdAt: number, updatedAt?: number }
 *
 * One folders collection per widget — folders never cross widgets. The
 * `widget` argument selects which collection this hook binds to, and is
 * mapped to the collection name via `folderCollectionName()` below.
 */

import { useMemo } from 'react';
import type { LibraryFolder, LibraryFolderWidget } from '@/types';

/**
 * Map a `LibraryFolderWidget` to its Firestore subcollection name.
 * Exported so Wave 3-B's internal writes + any admin tooling use a
 * single source of truth.
 */
export const folderCollectionName = (widget: LibraryFolderWidget): string => {
  switch (widget) {
    case 'quiz':
      return 'quiz_folders';
    case 'video_activity':
      return 'video_activity_folders';
    case 'guided_learning':
      return 'guided_learning_folders';
    case 'miniapp':
      return 'miniapp_folders';
  }
};

export interface UseFoldersResult {
  /** All folders for this (user, widget) pair. Empty while the shell is in place. */
  folders: LibraryFolder[];
  /** True while the initial Firestore snapshot is loading. */
  loading: boolean;
  /** Most recent error from a read/write, or null. */
  error: string | null;
  /**
   * Create a new folder under `parentId` (null = root). Returns the
   * folder id on success. Wave 3-B wires this to Firestore; the shell
   * throws so callers don't silently think a write succeeded.
   */
  createFolder: (name: string, parentId: string | null) => Promise<string>;
  /** Rename a folder by id. */
  renameFolder: (folderId: string, nextName: string) => Promise<void>;
  /**
   * Move a folder to a new parent. Passing `null` moves it to the root.
   * Implementations should guard against creating cycles (moving a
   * folder into its own descendant).
   */
  moveFolder: (folderId: string, nextParentId: string | null) => Promise<void>;
  /**
   * Delete a folder by id. The exact policy for children / items inside
   * the folder is a Wave 3-B decision (likely: reparent children to the
   * deleted folder's parent, and null out items' `folderId`).
   */
  deleteFolder: (folderId: string) => Promise<void>;
  /**
   * Reorder sibling folders under the same parent. Pass the full
   * ordered list of ids as they should appear after the move.
   */
  reorderSiblings: (
    parentId: string | null,
    orderedIds: string[]
  ) => Promise<void>;
}

/**
 * Shell implementation. Returns the full `UseFoldersResult` shape with
 * empty state and rejecting write operations. Wave 3-B replaces the body.
 */
export const useFolders = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userId: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  widget: LibraryFolderWidget
): UseFoldersResult => {
  // The returned object is memoized so consumers' `useEffect` dependencies
  // on it (if any) don't thrash. Wave 3-B will replace this with a real
  // listener-backed state machine.
  return useMemo<UseFoldersResult>(
    () => ({
      folders: [],
      loading: false,
      error: null,
      createFolder: () =>
        Promise.reject(
          new Error(
            'useFolders.createFolder: not implemented (Wave 3-A shell). Lands in Wave 3-B.'
          )
        ),
      renameFolder: () =>
        Promise.reject(
          new Error(
            'useFolders.renameFolder: not implemented (Wave 3-A shell). Lands in Wave 3-B.'
          )
        ),
      moveFolder: () =>
        Promise.reject(
          new Error(
            'useFolders.moveFolder: not implemented (Wave 3-A shell). Lands in Wave 3-B.'
          )
        ),
      deleteFolder: () =>
        Promise.reject(
          new Error(
            'useFolders.deleteFolder: not implemented (Wave 3-A shell). Lands in Wave 3-B.'
          )
        ),
      reorderSiblings: () =>
        Promise.reject(
          new Error(
            'useFolders.reorderSiblings: not implemented (Wave 3-A shell). Lands in Wave 3-B.'
          )
        ),
    }),
    []
  );
};
