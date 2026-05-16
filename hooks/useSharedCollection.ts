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
import { db, isAuthBypass } from '@/config/firebase';
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

// ---------------------------------------------------------------------------
// In-memory mock store for auth-bypass (dev / E2E) mode.
// Mirrors the singleton pattern in useFirestore.ts.
// ---------------------------------------------------------------------------
class MockSharedCollectionStore {
  private static instance: MockSharedCollectionStore;
  private collections = new Map<string, SharedCollection>();
  private boards = new Map<string, Map<string, Dashboard>>();

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): MockSharedCollectionStore {
    if (!MockSharedCollectionStore.instance) {
      MockSharedCollectionStore.instance = new MockSharedCollectionStore();
    }
    return MockSharedCollectionStore.instance;
  }

  save(shareId: string, meta: SharedCollection, boardList: Dashboard[]): void {
    this.collections.set(shareId, meta);
    const bMap = new Map<string, Dashboard>();
    for (const b of boardList) bMap.set(b.id, b);
    this.boards.set(shareId, bMap);
    try {
      sessionStorage.setItem(
        `mock_scoll_${shareId}`,
        JSON.stringify({ meta, boards: boardList })
      );
    } catch {
      /* session storage unavailable — in-memory only */
    }
  }

  getCollection(shareId: string): SharedCollection | null {
    if (this.collections.has(shareId)) {
      return this.collections.get(shareId) ?? null;
    }
    // Hydrate from sessionStorage (cross-navigation in E2E)
    try {
      const raw = sessionStorage.getItem(`mock_scoll_${shareId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          meta: SharedCollection;
          boards: Dashboard[];
        };
        this.collections.set(shareId, parsed.meta);
        const bMap = new Map<string, Dashboard>();
        for (const b of parsed.boards) bMap.set(b.id, b);
        this.boards.set(shareId, bMap);
        return parsed.meta;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  getBoards(shareId: string): Dashboard[] {
    // Ensure collection (and boards) are hydrated if only sessionStorage has them
    this.getCollection(shareId);
    return Array.from(this.boards.get(shareId)?.values() ?? []);
  }
}

const mockCollStore = MockSharedCollectionStore.getInstance();

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
   * Write order: ALL board sub-docs are committed first; the parent doc is
   * written LAST in its own batch. The parent's existence is the signal that
   * every board sub-doc was successfully persisted. If any board batch fails,
   * the parent is never written, so recipients see "not found or expired"
   * rather than a partial Collection.
   *
   * Trade-off: if board batches succeed but the final parent batch fails,
   * orphan board sub-docs remain under `/shared_collections/{shareId}/boards/*`.
   * They are never readable by anyone (no parent doc exists to expose the
   * shareId), so they only cost storage. A future scheduled cleanup can prune
   * them by walking sub-collections and checking parent existence.
   */
  const shareCollection = useCallback(
    async (input: ShareCollectionInput): Promise<string> => {
      const shareId = crypto.randomUUID();
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

      if (isAuthBypass) {
        mockCollStore.save(shareId, parentPayload, input.boards);
        return shareId;
      }

      // Phase 1: write ALL board sub-docs in chunked batches.
      // If any of these throws, the parent doc does not yet exist → recipient
      // can't load the share at all (clean failure, no partial-state surface).
      const BATCH_LIMIT = 400;
      let currentBatch = writeBatch(db);
      let inBatch = 0;

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

      // Phase 2: write the parent doc LAST. Its existence is the signal that
      // all sub-docs were successfully committed. Recipients cannot discover
      // the share until this batch lands.
      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      const parentBatch = writeBatch(db);
      parentBatch.set(parentRef, parentPayload);
      await parentBatch.commit();

      return shareId;
    },
    []
  );

  /**
   * Host action: substitute variant. Same parent-last write strategy as
   * shareCollection. Adds `expiresAt` + `buildingId` and sets
   * `intendedMode: 'substitute'` on the parent payload. Drive grants are
   * NOT implemented for Collection shares — see plan's "Known
   * limitations" for rationale.
   *
   * See shareCollection for the write-order trade-off comment (board
   * sub-docs first, parent last — clean failure on board batch error,
   * possible orphan board docs on parent batch error).
   */
  const shareSubstituteCollection = useCallback(
    async (input: SubstituteShareInput): Promise<string> => {
      const shareId = crypto.randomUUID();
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

      if (isAuthBypass) {
        mockCollStore.save(shareId, parentPayload, input.boards);
        return shareId;
      }

      // Phase 1: write ALL board sub-docs in chunked batches.
      // If any of these throws, the parent doc does not yet exist → recipient
      // can't load the share at all (clean failure, no partial-state surface).
      const BATCH_LIMIT = 400;
      let currentBatch = writeBatch(db);
      let inBatch = 0;

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

      // Phase 2: write the parent doc LAST. Its existence is the signal that
      // all sub-docs were successfully committed. Recipients cannot discover
      // the share until this batch lands.
      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      const parentBatch = writeBatch(db);
      parentBatch.set(parentRef, parentPayload);
      await parentBatch.commit();

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
      if (isAuthBypass) {
        const meta = mockCollStore.getCollection(shareId);
        if (!meta) return null;
        if (
          meta.intendedMode === 'substitute' &&
          meta.expiresAt &&
          meta.expiresAt < Date.now()
        ) {
          return null;
        }
        return meta;
      }
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
      if (isAuthBypass) {
        try {
          const allBoards = mockCollStore.getBoards(shareId);
          const byId = new Map(allBoards.map((b) => [b.id, b]));
          return boardIds
            .map((id) => byId.get(id))
            .filter((d): d is Dashboard => Boolean(d));
        } catch (err) {
          logError('useSharedCollection.loadSharedCollectionBoards', err, {
            shareId,
            boardIdCount: boardIds.length,
          });
          return [];
        }
      }
      try {
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
      } catch (err) {
        logError('useSharedCollection.loadSharedCollectionBoards', err, {
          shareId,
          boardIdCount: boardIds.length,
        });
        return [];
      }
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
