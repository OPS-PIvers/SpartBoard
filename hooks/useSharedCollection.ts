/**
 * useSharedCollection — Collection share lifecycle.
 *
 * Two writes (`shareCollection`, `shareSubstituteCollection`) and two
 * reads (`loadSharedCollection`, `loadSharedCollectionBoards`) plus the
 * recipient-side `importSharedCollection`. Mirrors the single-Board
 * sharing surface in `useFirestore.shareDashboard` etc., but scoped to
 * `/shared_collections/{shareId}`.
 *
 * The hook does NOT subscribe — Collection shares are one-shot writes/
 * reads, not live-mirrored. No onSnapshot.
 */

import { useCallback } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import type {
  Dashboard,
  SharedCollection,
  SharedCollectionBoardDoc,
  Collection as CollectionType,
  CollectionSubstituteShareInput,
} from '@/types';

const SHARED_COLLECTIONS_SUBPATH = 'shared_collections';
const SHARED_COLLECTION_BOARDS_SUBPATH = 'boards';

interface ShareCollectionInput {
  collection: CollectionType;
  boards: Dashboard[];
  hostUid: string;
  hostDisplayName: string | null;
}

type SubstituteShareInput = ShareCollectionInput &
  CollectionSubstituteShareInput;

export const useSharedCollection = () => {
  /**
   * Host action: write the share metadata + every Board snapshot in a
   * chunked writeBatch. Returns the new shareId.
   *
   * Chunking note: a `writeBatch` is capped at 500 operations. A Collection
   * with > 499 Boards exceeds that (metadata + 499 boards = 500). We split
   * into multiple batches if needed — boards are immutable post-creation,
   * so partial-batch failure recovery is simple (delete the parent if any
   * board batch fails). BATCH_LIMIT 400 leaves headroom for the parent
   * write in the first batch.
   */
  const shareCollection = useCallback(
    async (input: ShareCollectionInput): Promise<string> => {
      const shareId = crypto.randomUUID();
      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      const now = Date.now();

      const parentPayload: SharedCollection = {
        shareId,
        hostUid: input.hostUid,
        hostDisplayName: input.hostDisplayName,
        intendedMode: 'copy',
        collection: {
          name: input.collection.name,
          ...(input.collection.color !== undefined && {
            color: input.collection.color,
          }),
          ...(input.collection.icon !== undefined && {
            icon: input.collection.icon,
          }),
        },
        boardIds: input.boards.map((b) => b.id),
        createdAt: now,
      };

      const BATCH_LIMIT = 400;
      let currentBatch = writeBatch(db);
      currentBatch.set(parentRef, parentPayload);
      let inBatch = 1;

      for (const board of input.boards) {
        if (inBatch >= BATCH_LIMIT) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          inBatch = 0;
        }
        const boardRef = doc(
          db,
          SHARED_COLLECTIONS_SUBPATH,
          shareId,
          SHARED_COLLECTION_BOARDS_SUBPATH,
          board.id
        );
        const boardPayload: SharedCollectionBoardDoc = {
          boardId: board.id,
          dashboard: board,
        };
        currentBatch.set(boardRef, boardPayload);
        inBatch += 1;
      }
      if (inBatch > 0) await currentBatch.commit();

      return shareId;
    },
    []
  );

  /**
   * Host action: substitute variant. Same chunked-batch strategy as
   * shareCollection. Adds `expiresAt` + `buildingId` and sets
   * `intendedMode: 'substitute'` on the parent payload. Drive grants are
   * NOT implemented for Collection shares — see plan's "Known
   * limitations" for rationale.
   */
  const shareSubstituteCollection = useCallback(
    async (input: SubstituteShareInput): Promise<string> => {
      const shareId = crypto.randomUUID();
      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      const now = Date.now();

      const parentPayload: SharedCollection = {
        shareId,
        hostUid: input.hostUid,
        hostDisplayName: input.hostDisplayName,
        intendedMode: 'substitute',
        collection: {
          name: input.collection.name,
          ...(input.collection.color !== undefined && {
            color: input.collection.color,
          }),
          ...(input.collection.icon !== undefined && {
            icon: input.collection.icon,
          }),
        },
        boardIds: input.boards.map((b) => b.id),
        createdAt: now,
        expiresAt: input.expiresAt,
        buildingId: input.buildingId,
      };

      const BATCH_LIMIT = 400;
      let currentBatch = writeBatch(db);
      currentBatch.set(parentRef, parentPayload);
      let inBatch = 1;

      for (const board of input.boards) {
        if (inBatch >= BATCH_LIMIT) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          inBatch = 0;
        }
        const boardRef = doc(
          db,
          SHARED_COLLECTIONS_SUBPATH,
          shareId,
          SHARED_COLLECTION_BOARDS_SUBPATH,
          board.id
        );
        const boardPayload: SharedCollectionBoardDoc = {
          boardId: board.id,
          dashboard: board,
        };
        currentBatch.set(boardRef, boardPayload);
        inBatch += 1;
      }
      if (inBatch > 0) await currentBatch.commit();

      return shareId;
    },
    []
  );

  /**
   * Recipient action: fetch the share metadata doc. Returns null if not
   * found, expired, or rejected by rules. Logs errors via logError so
   * production failures surface in telemetry rather than the console.
   */
  const loadSharedCollection = useCallback(
    async (shareId: string): Promise<SharedCollection | null> => {
      try {
        const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
        const snap = await getDoc(parentRef);
        if (!snap.exists()) return null;
        const data = snap.data() as SharedCollection;
        if (
          data.intendedMode === 'substitute' &&
          data.expiresAt &&
          data.expiresAt < Date.now()
        ) {
          return null;
        }
        return data;
      } catch (err) {
        logError('useSharedCollection.loadSharedCollection', err, { shareId });
        return null;
      }
    },
    []
  );

  /**
   * Recipient action: fetch every frozen Board snapshot in the share.
   * Order respects the parent's `boardIds[]` so the recipient sees the
   * same ordering as the host had at share time. Single `getDocs` query
   * is cheaper than N parallel `getDoc` calls for moderate Collection
   * sizes (< 30 Boards).
   */
  const loadSharedCollectionBoards = useCallback(
    async (shareId: string, boardIds: string[]): Promise<Dashboard[]> => {
      const colRef = collection(
        db,
        SHARED_COLLECTIONS_SUBPATH,
        shareId,
        SHARED_COLLECTION_BOARDS_SUBPATH
      );
      const snap = await getDocs(colRef);
      const byId = new Map<string, Dashboard>();
      for (const d of snap.docs) {
        const data = d.data() as SharedCollectionBoardDoc;
        byId.set(d.id, data.dashboard);
      }
      return boardIds
        .map((id) => byId.get(id))
        .filter((d): d is Dashboard => Boolean(d));
    },
    []
  );

  return {
    shareCollection,
    shareSubstituteCollection,
    loadSharedCollection,
    loadSharedCollectionBoards,
  };
};
