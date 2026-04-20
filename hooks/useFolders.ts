/**
 * useFolders — library folder management (Wave 3-B).
 *
 * Streams folders from `/users/{userId}/{widget}_folders` and exposes CRUD
 * operations that round-trip to Firestore. The returned hook result is
 * memoized so consumers (FolderSidebar, managers) can include it in effect
 * dependency arrays without thrashing.
 *
 * Schema recap (see `types.ts` "Library folders (Wave 3)" section):
 *   /users/{userId}/{widget}_folders/{folderId}
 *     => { id, name, parentId: string | null, order: number,
 *          createdAt: number, updatedAt?: number }
 *
 * One folders collection per widget — folders never cross widgets. The
 * `widget` argument selects which collection this hook binds to via
 * `folderCollectionName()` below.
 *
 * Item-deletion semantics (the `delete-all` branch):
 *   When a folder is deleted in 'delete-all' mode, descendant FOLDERS are
 *   removed but the LIBRARY ITEMS inside those folders are preserved and
 *   re-homed to the deleted folder's parent (null = root). Teachers don't
 *   expect "delete folder" to delete their quizzes/activities/etc., so we
 *   default to non-destructive item handling. The `mode` parameter is kept
 *   for future UIs that need a true cascade delete.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { LibraryFolder, LibraryFolderWidget } from '@/types';

/**
 * Map a `LibraryFolderWidget` to its Firestore subcollection name.
 * Exported so internal writes + any admin tooling use a single source of
 * truth.
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

/**
 * Map a `LibraryFolderWidget` to the Firestore collection name holding the
 * ITEMS (quizzes, activities, sets, miniapps). Used by `moveItem` to update
 * the `folderId` field on an item's metadata doc.
 */
const itemCollectionName = (widget: LibraryFolderWidget): string => {
  switch (widget) {
    case 'quiz':
      return 'quizzes';
    case 'video_activity':
      return 'video_activities';
    case 'guided_learning':
      return 'guided_learning';
    case 'miniapp':
      return 'miniapps';
  }
};

export type DeleteFolderMode = 'move-to-parent' | 'delete-all';

export interface UseFoldersResult {
  /** All folders for this (user, widget) pair. */
  folders: LibraryFolder[];
  /** True while the initial Firestore snapshot is loading. */
  loading: boolean;
  /** Most recent error from a read/write, or null. */
  error: string | null;
  /**
   * Create a new folder under `parentId` (null = root). Returns the
   * folder id on success. Order is max(siblings) + 1.
   */
  createFolder: (name: string, parentId: string | null) => Promise<string>;
  /** Rename a folder by id. */
  renameFolder: (folderId: string, nextName: string) => Promise<void>;
  /**
   * Move a folder to a new parent. Passing `null` moves it to the root.
   * Rejects if `nextParentId` is a descendant of `folderId` (would create
   * a cycle).
   */
  moveFolder: (folderId: string, nextParentId: string | null) => Promise<void>;
  /**
   * Delete a folder. `mode` controls what happens to descendants:
   *   - 'move-to-parent': descendant folders and items in this folder are
   *     reparented to this folder's parent (null = root). No data lost.
   *   - 'delete-all': descendant folders are deleted; items are STILL
   *     reparented to the deleted folder's parent (we never delete items
   *     as a side-effect of folder deletion).
   */
  deleteFolder: (folderId: string, mode: DeleteFolderMode) => Promise<void>;
  /**
   * Reorder sibling folders under the same parent. Pass the full
   * ordered list of ids as they should appear after the move. Issues a
   * batched write updating `order` on each sibling.
   */
  reorderSiblings: (
    parentId: string | null,
    orderedIds: string[]
  ) => Promise<void>;
  /**
   * Move a library item (quiz, activity, set, miniapp) into a folder.
   * `folderId: null` returns the item to root. Updates the item's
   * metadata doc in `/users/{userId}/{item-collection}/{itemId}`.
   */
  moveItem: (itemId: string, folderId: string | null) => Promise<void>;
}

export const useFolders = (
  userId: string | undefined,
  widget: LibraryFolderWidget
): UseFoldersResult => {
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [loading, setLoading] = useState<boolean>(!!userId);
  const [error, setError] = useState<string | null>(null);

  // Adjust state when userId transitions away — avoids the
  // "set-state-in-effect" anti-pattern while still clearing stale data on
  // sign-out.
  const [prevUserId, setPrevUserId] = useState(userId);
  if (userId !== prevUserId) {
    setPrevUserId(userId);
    if (!userId) {
      setFolders([]);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }
  }

  const collectionName = folderCollectionName(widget);
  const itemsCollection = itemCollectionName(widget);

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'users', userId, collectionName),
      orderBy('order', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: LibraryFolder[] = snap.docs.map((d) => {
          const data = d.data() as Omit<LibraryFolder, 'id'>;
          return { ...data, id: d.id };
        });
        setFolders(list);
        setLoading(false);
      },
      (err) => {
        console.error('[useFolders] Firestore error:', err);
        setError('Failed to load folders');
        setLoading(false);
      }
    );

    return unsub;
  }, [userId, collectionName]);

  const createFolder = useCallback(
    async (name: string, parentId: string | null): Promise<string> => {
      if (!userId) throw new Error('Not authenticated');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Folder name is required');

      // Compute next order = max(siblings) + 1. Folders are already sorted
      // client-side, but recompute against the current state to avoid
      // duplicate order values under rapid creates.
      const siblingOrders = folders
        .filter((f) => f.parentId === parentId)
        .map((f) => f.order);
      const nextOrder =
        siblingOrders.length === 0 ? 0 : Math.max(...siblingOrders) + 1;

      const now = Date.now();
      const ref = await addDoc(
        collection(db, 'users', userId, collectionName),
        {
          name: trimmed,
          parentId,
          order: nextOrder,
          createdAt: now,
          updatedAt: now,
        }
      );
      return ref.id;
    },
    [userId, collectionName, folders]
  );

  const renameFolder = useCallback(
    async (folderId: string, nextName: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const trimmed = nextName.trim();
      if (!trimmed) throw new Error('Folder name is required');

      const batch = writeBatch(db);
      batch.update(doc(db, 'users', userId, collectionName, folderId), {
        name: trimmed,
        updatedAt: Date.now(),
      });
      await batch.commit();
    },
    [userId, collectionName]
  );

  // Helper: walk up the parent chain to detect a cycle. Returns true if
  // `candidateAncestorId` is an ancestor of (or equal to) `folderId`.
  const isDescendantOrSelf = useCallback(
    (candidateAncestorId: string, folderId: string): boolean => {
      if (candidateAncestorId === folderId) return true;
      const byId = new Map(folders.map((f) => [f.id, f] as const));
      let cursor = byId.get(candidateAncestorId);
      // Walk UP from candidateAncestor. If we encounter folderId, then
      // folderId is an ancestor of candidate → moving folderId under
      // candidate creates a cycle.
      let depth = 0;
      while (cursor && depth < 256) {
        if (cursor.id === folderId) return true;
        if (cursor.parentId == null) break;
        cursor = byId.get(cursor.parentId);
        depth += 1;
      }
      return false;
    },
    [folders]
  );

  const moveFolder = useCallback(
    async (folderId: string, nextParentId: string | null): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      if (folderId === nextParentId) {
        throw new Error('Cannot move a folder into itself');
      }
      if (nextParentId != null && isDescendantOrSelf(nextParentId, folderId)) {
        throw new Error('Cannot move a folder into one of its own subfolders');
      }

      // New order = max(siblings under nextParent) + 1 so the moved folder
      // appears at the end of its new parent's list.
      const siblingOrders = folders
        .filter((f) => f.parentId === nextParentId && f.id !== folderId)
        .map((f) => f.order);
      const nextOrder =
        siblingOrders.length === 0 ? 0 : Math.max(...siblingOrders) + 1;

      const batch = writeBatch(db);
      batch.update(doc(db, 'users', userId, collectionName, folderId), {
        parentId: nextParentId,
        order: nextOrder,
        updatedAt: Date.now(),
      });
      await batch.commit();
    },
    [userId, collectionName, folders, isDescendantOrSelf]
  );

  const reorderSiblings = useCallback(
    async (_parentId: string | null, orderedIds: string[]): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      if (orderedIds.length === 0) return;

      const batch = writeBatch(db);
      const now = Date.now();
      orderedIds.forEach((id, index) => {
        batch.update(doc(db, 'users', userId, collectionName, id), {
          order: index,
          updatedAt: now,
        });
      });
      await batch.commit();
    },
    [userId, collectionName]
  );

  // Recursively collect descendant folder ids (children, grandchildren, …)
  // of `rootId`. Excludes `rootId` itself.
  const collectDescendantFolderIds = useCallback(
    (rootId: string): string[] => {
      const byParent = new Map<string | null, LibraryFolder[]>();
      for (const f of folders) {
        const bucket = byParent.get(f.parentId) ?? [];
        bucket.push(f);
        byParent.set(f.parentId, bucket);
      }
      const out: string[] = [];
      const walk = (id: string): void => {
        const kids = byParent.get(id) ?? [];
        for (const k of kids) {
          out.push(k.id);
          walk(k.id);
        }
      };
      walk(rootId);
      return out;
    },
    [folders]
  );

  const deleteFolder = useCallback(
    async (folderId: string, mode: DeleteFolderMode): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const target = folders.find((f) => f.id === folderId);
      if (!target) throw new Error('Folder not found');

      const batch = writeBatch(db);
      const now = Date.now();

      if (mode === 'move-to-parent') {
        // Reparent direct children folders to target's parent.
        const childFolders = folders.filter((f) => f.parentId === folderId);
        for (const cf of childFolders) {
          batch.update(doc(db, 'users', userId, collectionName, cf.id), {
            parentId: target.parentId,
            updatedAt: now,
          });
        }
        // Reparent items in this folder to target's parent (null or id).
        // Firestore doesn't let us filter inside a batch — we need a read
        // step first via getDocs.
        const itemQuery = query(
          collection(db, 'users', userId, itemsCollection),
          where('folderId', '==', folderId)
        );
        const itemSnap = await getDocs(itemQuery);
        itemSnap.docs.forEach((d) => {
          batch.update(d.ref, {
            folderId: target.parentId,
          });
        });
        // Delete the folder doc itself.
        batch.delete(doc(db, 'users', userId, collectionName, folderId));
        await batch.commit();
        return;
      }

      // mode === 'delete-all'
      // Collect this folder + all descendants. Delete folder docs for each.
      // For items, we STILL re-home to the deleted folder's parent rather
      // than deleting — destructive content loss must be explicit, not a
      // side-effect of folder cleanup.
      const descendantIds = collectDescendantFolderIds(folderId);
      const allFolderIds = [folderId, ...descendantIds];

      // Re-home items in this folder tree. Firestore 'in' queries support up
      // to 30 ids per query as of 2024; chunk to be safe.
      const CHUNK = 30;
      for (let i = 0; i < allFolderIds.length; i += CHUNK) {
        const chunk = allFolderIds.slice(i, i + CHUNK);
        const itemQuery = query(
          collection(db, 'users', userId, itemsCollection),
          where('folderId', 'in', chunk)
        );
        const itemSnap = await getDocs(itemQuery);
        itemSnap.docs.forEach((d) => {
          batch.update(d.ref, { folderId: target.parentId });
        });
      }

      // Delete each folder doc. Batch limit is 500 writes; each folder
      // contributes one delete plus any reparent updates above. For very
      // large trees (>500) we commit and start a new batch.
      let writeCount = 0;
      let currentBatch = batch;
      for (const id of allFolderIds) {
        if (writeCount >= 400) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          writeCount = 0;
        }
        currentBatch.delete(doc(db, 'users', userId, collectionName, id));
        writeCount += 1;
      }
      await currentBatch.commit();
    },
    [
      userId,
      collectionName,
      itemsCollection,
      folders,
      collectDescendantFolderIds,
    ]
  );

  const moveItem = useCallback(
    async (itemId: string, folderId: string | null): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', userId, itemsCollection, itemId), {
        folderId,
        updatedAt: Date.now(),
      });
      await batch.commit();
    },
    [userId, itemsCollection]
  );

  // Keep serverTimestamp reference alive for tree-shakers that prune unused
  // imports. Firestore v9 needs at least one import callable from the graph;
  // other fields above use Date.now() for consistency across clients.
  void serverTimestamp;

  return useMemo<UseFoldersResult>(
    () => ({
      folders,
      loading,
      error,
      createFolder,
      renameFolder,
      moveFolder,
      deleteFolder,
      reorderSiblings,
      moveItem,
    }),
    [
      folders,
      loading,
      error,
      createFolder,
      renameFolder,
      moveFolder,
      deleteFolder,
      reorderSiblings,
      moveItem,
    ]
  );
};
