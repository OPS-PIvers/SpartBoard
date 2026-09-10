/**
 * useFolderTree — path-parameterized folder tree management, shared by
 * personal library folders (useFolders) and PLC folders (usePlcFolders).
 *
 * Streams folders from `folderPath` and exposes CRUD operations that
 * round-trip to Firestore. `itemPaths` names every collection whose docs
 * carry `folderId`; index 0 is the `moveItem` target, and all of them are
 * re-homed when a folder is deleted.
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
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { collectDescendantIds } from '@/utils/folderTree';
import type { LibraryFolder } from '@/types';

export type DeleteFolderMode = 'move-to-parent' | 'delete-all';

export interface FolderTreeConfig {
  /** Path segments of the folders collection; null disables the hook (empty state, loading=false). */
  folderPath: string[] | null;
  /** Collections whose docs carry `folderId`; index 0 is the `moveItem` target. All are re-homed on deleteFolder. */
  itemPaths: string[][];
  /** Extra context for logError. */
  logContext?: Record<string, unknown>;
}

export interface UseFoldersResult {
  /** All folders for this path. */
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
   * Move a library item into a folder (itemPaths[0]). `folderId: null`
   * returns the item to root.
   */
  moveItem: (itemId: string, folderId: string | null) => Promise<void>;
}

export function useFolderTree(config: FolderTreeConfig): UseFoldersResult {
  const { folderPath, itemPaths, logContext } = config;
  const folderKey = folderPath?.join('/') ?? null;
  const itemsKey = itemPaths.map((p) => p.join('/')).join('|');
  // Joined paths are stable across renders, so callers may pass fresh arrays.
  const itemKeys = useMemo(
    () => (itemsKey ? itemsKey.split('|') : []),
    [itemsKey]
  );

  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [loading, setLoading] = useState<boolean>(!!folderKey);
  const [error, setError] = useState<string | null>(null);

  // Adjust state when the folder key transitions — avoids the
  // "set-state-in-effect" anti-pattern while still clearing stale data.
  const [prevFolderKey, setPrevFolderKey] = useState(folderKey);
  if (folderKey !== prevFolderKey) {
    setPrevFolderKey(folderKey);
    if (!folderKey) {
      setFolders([]);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!folderKey) return;

    const q = query(collection(db, folderKey), orderBy('order', 'asc'));

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
        logError('useFolderTree.onSnapshot', err, { folderKey, ...logContext });
        setError('Failed to load folders');
        setLoading(false);
      }
    );

    return unsub;
  }, [folderKey, logContext]);

  const createFolder = useCallback(
    async (name: string, parentId: string | null): Promise<string> => {
      if (!folderKey) throw new Error('Not authenticated');
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
      const ref = await addDoc(collection(db, folderKey), {
        name: trimmed,
        parentId,
        order: nextOrder,
        createdAt: now,
        updatedAt: now,
      });
      return ref.id;
    },
    [folderKey, folders]
  );

  const renameFolder = useCallback(
    async (folderId: string, nextName: string): Promise<void> => {
      if (!folderKey) throw new Error('Not authenticated');
      const trimmed = nextName.trim();
      if (!trimmed) throw new Error('Folder name is required');

      const batch = writeBatch(db);
      batch.update(doc(db, folderKey, folderId), {
        name: trimmed,
        updatedAt: Date.now(),
      });
      await batch.commit();
    },
    [folderKey]
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
      if (!folderKey) throw new Error('Not authenticated');
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
      batch.update(doc(db, folderKey, folderId), {
        parentId: nextParentId,
        order: nextOrder,
        updatedAt: Date.now(),
      });
      await batch.commit();
    },
    [folderKey, folders, isDescendantOrSelf]
  );

  const reorderSiblings = useCallback(
    async (_parentId: string | null, orderedIds: string[]): Promise<void> => {
      if (!folderKey) throw new Error('Not authenticated');
      if (orderedIds.length === 0) return;

      const batch = writeBatch(db);
      const now = Date.now();
      orderedIds.forEach((id, index) => {
        batch.update(doc(db, folderKey, id), {
          order: index,
          updatedAt: now,
        });
      });
      await batch.commit();
    },
    [folderKey]
  );

  // Descendant folder ids (children, grandchildren, …) of rootId, excluding rootId itself; cycle-safe.
  const collectDescendantFolderIds = useCallback(
    (rootId: string): string[] =>
      collectDescendantIds(rootId, folders, (f) => f.parentId),
    [folders]
  );

  const deleteFolder = useCallback(
    async (folderId: string, mode: DeleteFolderMode): Promise<void> => {
      if (!folderKey) throw new Error('Not authenticated');
      const target = folders.find((f) => f.id === folderId);
      if (!target) throw new Error('Folder not found');

      const now = Date.now();
      // Phase tracking matches useCollections.deleteCollection — if a partial
      // failure occurs mid-tree, the log carries enough context for triage.
      // 'rehome-items-read' = getDocs of items to re-home in flight
      // 'rehome-items-write' = writeBatch of re-home updates in flight
      let phase:
        | 'init'
        | 'reparent-children'
        | 'rehome-items-read'
        | 'rehome-items-write'
        | 'delete-docs' = 'init';
      let itemsRehomed = 0;
      let foldersDeleted = 0;
      let childrenReparented = 0;
      // Firestore batch limit is 500 writes; we chunk at 400 to keep headroom
      // for batches that mix updates and deletes.
      const BATCH_LIMIT = 400;

      try {
        if (mode === 'move-to-parent') {
          // Phase 1: reparent direct children folders to target's parent.
          phase = 'reparent-children';
          const childFolders = folders.filter((f) => f.parentId === folderId);
          let phase1Batch = writeBatch(db);
          let phase1Count = 0;
          for (const cf of childFolders) {
            if (phase1Count >= BATCH_LIMIT) {
              await phase1Batch.commit();
              childrenReparented += phase1Count;
              phase1Batch = writeBatch(db);
              phase1Count = 0;
            }
            phase1Batch.update(doc(db, folderKey, cf.id), {
              parentId: target.parentId,
              updatedAt: now,
            });
            phase1Count += 1;
          }
          if (phase1Count > 0) {
            await phase1Batch.commit();
            childrenReparented += phase1Count;
          }

          // Phase 2: reparent items in this folder (all itemPaths) to target's parent.
          phase = 'rehome-items-read';
          for (const itemPath of itemKeys) {
            const itemQuery = query(
              collection(db, itemPath),
              where('folderId', '==', folderId)
            );
            const itemSnap = await getDocs(itemQuery);
            phase = 'rehome-items-write';
            let phase2Batch = writeBatch(db);
            let phase2Count = 0;
            for (const d of itemSnap.docs) {
              if (phase2Count >= BATCH_LIMIT) {
                await phase2Batch.commit();
                itemsRehomed += phase2Count;
                phase2Batch = writeBatch(db);
                phase2Count = 0;
              }
              phase2Batch.update(d.ref, { folderId: target.parentId });
              phase2Count += 1;
            }
            if (phase2Count > 0) {
              await phase2Batch.commit();
              itemsRehomed += phase2Count;
            }
            phase = 'rehome-items-read';
          }

          // Phase 3: delete the folder doc itself (single write).
          phase = 'delete-docs';
          const phase3Batch = writeBatch(db);
          phase3Batch.delete(doc(db, folderKey, folderId));
          await phase3Batch.commit();
          foldersDeleted = 1;
          return;
        }

        // mode === 'delete-all'
        // Collect this folder + all descendants. Delete folder docs for each.
        // For items, we STILL re-home to the deleted folder's parent rather
        // than deleting — destructive content loss must be explicit, not a
        // side-effect of folder cleanup.
        const descendantIds = collectDescendantFolderIds(folderId);
        const allFolderIds = [folderId, ...descendantIds];

        // Phase 1: re-home items (all itemPaths) in this folder tree. Firestore
        // 'in' queries are capped at 30 ids; chunk the queries and chunk batch
        // writes at BATCH_LIMIT independently.
        const QUERY_CHUNK = 30;
        for (const itemPath of itemKeys) {
          let rehomeBatch = writeBatch(db);
          let rehomeCount = 0;
          for (let i = 0; i < allFolderIds.length; i += QUERY_CHUNK) {
            const chunk = allFolderIds.slice(i, i + QUERY_CHUNK);
            const itemQuery = query(
              collection(db, itemPath),
              where('folderId', 'in', chunk)
            );
            phase = 'rehome-items-read';
            const itemSnap = await getDocs(itemQuery);
            phase = 'rehome-items-write';
            for (const d of itemSnap.docs) {
              if (rehomeCount >= BATCH_LIMIT) {
                await rehomeBatch.commit();
                itemsRehomed += rehomeCount;
                rehomeBatch = writeBatch(db);
                rehomeCount = 0;
              }
              rehomeBatch.update(d.ref, { folderId: target.parentId });
              rehomeCount += 1;
            }
          }
          if (rehomeCount > 0) {
            await rehomeBatch.commit();
            itemsRehomed += rehomeCount;
          }
        }

        // Phase 2: delete each folder doc, chunked at BATCH_LIMIT writes.
        phase = 'delete-docs';
        let deleteBatch = writeBatch(db);
        let deleteCount = 0;
        for (const id of allFolderIds) {
          if (deleteCount >= BATCH_LIMIT) {
            await deleteBatch.commit();
            foldersDeleted += deleteCount;
            deleteBatch = writeBatch(db);
            deleteCount = 0;
          }
          deleteBatch.delete(doc(db, folderKey, id));
          deleteCount += 1;
        }
        if (deleteCount > 0) {
          await deleteBatch.commit();
          foldersDeleted += deleteCount;
        }
      } catch (err) {
        logError('useFolderTree.deleteFolder', err, {
          folderId,
          mode,
          phase,
          childrenReparented,
          itemsRehomed,
          foldersDeleted,
          ...logContext,
        });
        throw err;
      }
    },
    [folderKey, itemKeys, folders, collectDescendantFolderIds, logContext]
  );

  const moveItem = useCallback(
    async (itemId: string, folderId: string | null): Promise<void> => {
      const targetItemPath = itemKeys[0];
      if (!targetItemPath) throw new Error('Not authenticated');
      const batch = writeBatch(db);
      batch.update(doc(db, targetItemPath, itemId), {
        folderId,
        updatedAt: Date.now(),
      });
      await batch.commit();
    },
    [itemKeys]
  );

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
}
