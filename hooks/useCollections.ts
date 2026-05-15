/**
 * useCollections — Board collection management.
 *
 * Streams collections from `/users/{userId}/collections` and exposes CRUD
 * operations that round-trip to Firestore. The returned hook result is
 * memoized so consumers can include it in effect dependency arrays without
 * thrashing.
 *
 * Schema recap (see `types.ts` `Collection`):
 *   /users/{userId}/collections/{collectionId}
 *     => { id, name, parentCollectionId: string | null, order: number,
 *          color?, icon?, defaultBoardId?, createdAt, updatedAt? }
 *
 * Board re-homing semantics on collection delete:
 *   When a Collection is deleted in 'move-to-parent' mode, descendant
 *   Collections are reparented to the deleted Collection's parent (null = root)
 *   and Boards inside are re-homed to that same parent. 'delete-all' deletes
 *   descendant Collections but STILL re-homes Boards rather than deleting
 *   them — destructive Board loss must be explicit, never a side-effect of
 *   Collection cleanup.
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
import type { Collection } from '@/types';

const COLLECTIONS_SUBPATH = 'collections';
const DASHBOARDS_SUBPATH = 'dashboards';

export type DeleteCollectionMode = 'move-to-parent' | 'delete-all';

export interface UseCollectionsResult {
  collections: Collection[];
  loading: boolean;
  error: string | null;
  createCollection: (
    name: string,
    parentCollectionId: string | null
  ) => Promise<string>;
  renameCollection: (collectionId: string, nextName: string) => Promise<void>;
  moveCollection: (
    collectionId: string,
    nextParentCollectionId: string | null
  ) => Promise<void>;
  deleteCollection: (
    collectionId: string,
    mode: DeleteCollectionMode
  ) => Promise<void>;
  reorderSiblings: (
    parentCollectionId: string | null,
    orderedIds: string[]
  ) => Promise<void>;
  setCollectionMetadata: (
    collectionId: string,
    patch: Partial<Pick<Collection, 'name' | 'color' | 'icon'>>
  ) => Promise<void>;
  setCollectionDefaultBoard: (
    collectionId: string,
    boardId: string | null
  ) => Promise<void>;
}

export const useCollections = (
  userId: string | undefined
): UseCollectionsResult => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState<boolean>(!!userId);
  const [error, setError] = useState<string | null>(null);

  // Reset state on userId change without using useEffect.
  const [prevUserId, setPrevUserId] = useState(userId);
  if (userId !== prevUserId) {
    setPrevUserId(userId);
    if (!userId) {
      setCollections([]);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'users', userId, COLLECTIONS_SUBPATH),
      orderBy('order', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Collection[] = snap.docs.map((d) => {
          const data = d.data() as Omit<Collection, 'id'>;
          return { ...data, id: d.id };
        });
        setCollections(list);
        setLoading(false);
      },
      (err) => {
        console.error('[useCollections] Firestore error:', err);
        setError('Failed to load collections');
        setLoading(false);
      }
    );

    return unsub;
  }, [userId]);

  const createCollection = useCallback(
    async (
      name: string,
      parentCollectionId: string | null
    ): Promise<string> => {
      if (!userId) throw new Error('Not authenticated');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Collection name is required');

      const siblingOrders = collections
        .filter((c) => c.parentCollectionId === parentCollectionId)
        .map((c) => c.order);
      const nextOrder =
        siblingOrders.length === 0 ? 0 : Math.max(...siblingOrders) + 1;

      const now = Date.now();
      const ref = await addDoc(
        collection(db, 'users', userId, COLLECTIONS_SUBPATH),
        {
          name: trimmed,
          parentCollectionId,
          order: nextOrder,
          createdAt: now,
          updatedAt: now,
        }
      );
      return ref.id;
    },
    [userId, collections]
  );

  const renameCollection = useCallback(
    async (collectionId: string, nextName: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const trimmed = nextName.trim();
      if (!trimmed) throw new Error('Collection name is required');

      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, COLLECTIONS_SUBPATH, collectionId),
        {
          name: trimmed,
          updatedAt: Date.now(),
        }
      );
      await batch.commit();
    },
    [userId]
  );

  // Detect whether moving `collectionId` under `candidateAncestorId` would
  // create a cycle. Walks UP from candidate; if we encounter collectionId,
  // collectionId is an ancestor of candidate → cycle.
  const isDescendantOrSelf = useCallback(
    (candidateAncestorId: string, collectionId: string): boolean => {
      if (candidateAncestorId === collectionId) return true;
      const byId = new Map(collections.map((c) => [c.id, c] as const));
      let cursor = byId.get(candidateAncestorId);
      let depth = 0;
      while (cursor && depth < 256) {
        if (cursor.id === collectionId) return true;
        if (cursor.parentCollectionId == null) break;
        cursor = byId.get(cursor.parentCollectionId);
        depth += 1;
      }
      return false;
    },
    [collections]
  );

  const moveCollection = useCallback(
    async (
      collectionId: string,
      nextParentCollectionId: string | null
    ): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      if (collectionId === nextParentCollectionId) {
        throw new Error('Cannot move a collection into itself');
      }
      if (
        nextParentCollectionId != null &&
        isDescendantOrSelf(nextParentCollectionId, collectionId)
      ) {
        throw new Error(
          'Cannot move a collection into one of its own subcollections'
        );
      }

      const siblingOrders = collections
        .filter(
          (c) =>
            c.parentCollectionId === nextParentCollectionId &&
            c.id !== collectionId
        )
        .map((c) => c.order);
      const nextOrder =
        siblingOrders.length === 0 ? 0 : Math.max(...siblingOrders) + 1;

      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, COLLECTIONS_SUBPATH, collectionId),
        {
          parentCollectionId: nextParentCollectionId,
          order: nextOrder,
          updatedAt: Date.now(),
        }
      );
      await batch.commit();
    },
    [userId, collections, isDescendantOrSelf]
  );

  const reorderSiblings = useCallback(
    async (
      _parentCollectionId: string | null,
      orderedIds: string[]
    ): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      if (orderedIds.length === 0) return;

      const batch = writeBatch(db);
      const now = Date.now();
      orderedIds.forEach((id, index) => {
        batch.update(doc(db, 'users', userId, COLLECTIONS_SUBPATH, id), {
          order: index,
          updatedAt: now,
        });
      });
      await batch.commit();
    },
    [userId]
  );

  const setCollectionMetadata = useCallback(
    async (
      collectionId: string,
      patch: Partial<Pick<Collection, 'name' | 'color' | 'icon'>>
    ): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const update: Record<string, unknown> = { updatedAt: Date.now() };
      if (patch.name !== undefined) {
        const trimmed = patch.name.trim();
        if (!trimmed) throw new Error('Collection name is required');
        update.name = trimmed;
      }
      if (patch.color !== undefined) update.color = patch.color;
      if (patch.icon !== undefined) update.icon = patch.icon;

      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, COLLECTIONS_SUBPATH, collectionId),
        update
      );
      await batch.commit();
    },
    [userId]
  );

  const setCollectionDefaultBoard = useCallback(
    async (collectionId: string, boardId: string | null): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, COLLECTIONS_SUBPATH, collectionId),
        {
          defaultBoardId: boardId,
          updatedAt: Date.now(),
        }
      );
      await batch.commit();
    },
    [userId]
  );

  // Recursively collect descendant collection ids.
  const collectDescendantCollectionIds = useCallback(
    (rootId: string): string[] => {
      const byParent = new Map<string | null, Collection[]>();
      for (const c of collections) {
        const bucket = byParent.get(c.parentCollectionId) ?? [];
        bucket.push(c);
        byParent.set(c.parentCollectionId, bucket);
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
    [collections]
  );

  const deleteCollection = useCallback(
    async (collectionId: string, mode: DeleteCollectionMode): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const target = collections.find((c) => c.id === collectionId);
      if (!target) throw new Error('Collection not found');

      const batch = writeBatch(db);
      const now = Date.now();

      if (mode === 'move-to-parent') {
        // Reparent direct child collections to target's parent.
        const childCollections = collections.filter(
          (c) => c.parentCollectionId === collectionId
        );
        for (const cc of childCollections) {
          batch.update(doc(db, 'users', userId, COLLECTIONS_SUBPATH, cc.id), {
            parentCollectionId: target.parentCollectionId,
            updatedAt: now,
          });
        }
        // Re-home Boards in this Collection to target's parent (null or id).
        const boardsQuery = query(
          collection(db, 'users', userId, DASHBOARDS_SUBPATH),
          where('collectionId', '==', collectionId)
        );
        const boardSnap = await getDocs(boardsQuery);
        boardSnap.docs.forEach((d) => {
          batch.update(d.ref, {
            collectionId: target.parentCollectionId,
            updatedAt: now,
          });
        });
        batch.delete(
          doc(db, 'users', userId, COLLECTIONS_SUBPATH, collectionId)
        );
        await batch.commit();
        return;
      }

      // mode === 'delete-all'
      const descendantIds = collectDescendantCollectionIds(collectionId);
      const allCollectionIds = [collectionId, ...descendantIds];

      // Re-home Boards anywhere in this tree to target's parent. Chunk to
      // stay within Firestore 'in' query limit (30).
      const CHUNK = 30;
      for (let i = 0; i < allCollectionIds.length; i += CHUNK) {
        const chunkIds = allCollectionIds.slice(i, i + CHUNK);
        const boardsQuery = query(
          collection(db, 'users', userId, DASHBOARDS_SUBPATH),
          where('collectionId', 'in', chunkIds)
        );
        const boardSnap = await getDocs(boardsQuery);
        boardSnap.docs.forEach((d) => {
          batch.update(d.ref, {
            collectionId: target.parentCollectionId,
            updatedAt: now,
          });
        });
      }

      // Delete each Collection doc. Batch limit is 500 writes; chunk.
      let writeCount = 0;
      let currentBatch = batch;
      for (const id of allCollectionIds) {
        if (writeCount >= 400) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          writeCount = 0;
        }
        currentBatch.delete(doc(db, 'users', userId, COLLECTIONS_SUBPATH, id));
        writeCount += 1;
      }
      await currentBatch.commit();
    },
    [userId, collections, collectDescendantCollectionIds]
  );

  return useMemo<UseCollectionsResult>(
    () => ({
      collections,
      loading,
      error,
      createCollection,
      renameCollection,
      moveCollection,
      deleteCollection,
      reorderSiblings,
      setCollectionMetadata,
      setCollectionDefaultBoard,
    }),
    [
      collections,
      loading,
      error,
      createCollection,
      renameCollection,
      moveCollection,
      deleteCollection,
      reorderSiblings,
      setCollectionMetadata,
      setCollectionDefaultBoard,
    ]
  );
};
