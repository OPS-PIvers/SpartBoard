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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { sanitizeBoardSnapshot } from '@/utils/dashboardSanitize';
import type {
  Dashboard,
  SharedCollection,
  SharedCollectionBoardDoc,
  Collection as CollectionType,
  CollectionSubstituteShareInput,
} from '@/types';

const SHARED_COLLECTIONS_SUBPATH = 'shared_collections';
const SHARED_COLLECTION_BOARDS_SUBPATH = 'boards';

/**
 * Result of {@link loadSharedCollection}. Differentiates a definitively
 * unavailable share (not-found / expired) from a transient failure to
 * determine its state (unauthorized / network / malformed) so the caller
 * can render the right user message.
 */
export type LoadSharedCollectionResult =
  | { ok: true; meta: SharedCollection }
  | {
      ok: false;
      reason: 'not-found' | 'expired' | 'unauthorized' | 'error';
    };

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

/**
 * Commit every Board snapshot under `/shared_collections/{shareId}/boards/`
 * in chunked batches. Parent doc is assumed already written by the caller.
 *
 * On batch failure: log with rich context (boards committed so far, total,
 * which batch was in-flight) and attempt a best-effort cleanup of the
 * partially-populated share — delete the parent doc so the recipient gets
 * "not-found" instead of a half-populated share with no warning. Re-throws
 * a descriptive error so the modal's catch can surface it to the host as
 * a real failure instead of returning a share URL that won't fully load.
 */
async function commitBoardBatches({
  shareId,
  boards,
  scope,
}: {
  shareId: string;
  boards: Dashboard[];
  scope: 'shareCollection' | 'shareSubstituteCollection';
}): Promise<void> {
  const BATCH_LIMIT = 400;
  let currentBatch = writeBatch(db);
  let inBatch = 0;
  let boardsCommitted = 0;

  try {
    for (const board of boards) {
      if (inBatch >= BATCH_LIMIT) {
        await currentBatch.commit();
        boardsCommitted += inBatch;
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
        dashboard: sanitizeBoardSnapshot(board),
      };
      currentBatch.set(boardRef, boardPayload);
      inBatch += 1;
    }
    if (inBatch > 0) {
      await currentBatch.commit();
      boardsCommitted += inBatch;
    }
  } catch (err) {
    logError(`useSharedCollection.${scope}.boardBatch`, err, {
      shareId,
      boardsCommitted,
      totalBoards: boards.length,
    });
    // Best-effort cleanup: drop the parent doc so the share fails fast as
    // "not-found" rather than presenting a partially-populated Collection
    // to the recipient. If cleanup itself fails, log and continue — the
    // original failure is the one we re-throw.
    try {
      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      await deleteDoc(parentRef);
    } catch (cleanupErr) {
      logError(`useSharedCollection.${scope}.partialCleanup`, cleanupErr, {
        shareId,
        boardsCommitted,
      });
    }
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to upload all boards (${boardsCommitted.toString()} of ${boards.length.toString()} committed). The share has been cancelled — please try again. (${cause})`
    );
  }
}

export const useSharedCollection = () => {
  /**
   * Host action: write the share metadata + every Board snapshot in a
   * chunked writeBatch. Returns the new shareId.
   *
   * Write order: parent doc FIRST, then board sub-docs in chunked batches.
   * The Firestore subcollection rule reads `parent.hostUid` to authorise
   * board writes — without the parent doc the rule expression cannot
   * evaluate and the write is denied. Auth-bypass (E2E) skips Firestore
   * rules, which is why parent-last slipped through testing.
   *
   * If a board batch fails after the parent lands, `commitBoardBatches`
   * attempts a best-effort cleanup of the parent doc and re-throws —
   * the recipient should see "not-found" rather than a partial Collection.
   * The pre-existing partial-load detection in importSharedCollection
   * remains as a second line of defence for any stale state that escapes
   * cleanup.
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

      // Write the parent doc FIRST. The subcollection rule reads
      // parent.hostUid to authorize board writes; without an existing
      // parent doc, board batches are denied by Firestore rules.
      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      const parentBatch = writeBatch(db);
      parentBatch.set(parentRef, parentPayload);
      await parentBatch.commit();

      await commitBoardBatches({
        shareId,
        boards: input.boards,
        scope: 'shareCollection',
      });

      return shareId;
    },
    []
  );

  /**
   * Host action: substitute variant. Same parent-first write strategy as
   * shareCollection. Adds `expiresAt` + `buildingId` and sets
   * `intendedMode: 'substitute'` on the parent payload. Drive grants are
   * NOT implemented for Collection shares — see plan's "Known
   * limitations" for rationale.
   *
   * See shareCollection for the write-order rationale (parent first, then
   * board sub-docs — the subcollection rule reads parent.hostUid).
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

      // Write the parent doc FIRST. The subcollection rule reads
      // parent.hostUid to authorize board writes; without an existing
      // parent doc, board batches are denied by Firestore rules.
      const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
      const parentBatch = writeBatch(db);
      parentBatch.set(parentRef, parentPayload);
      await parentBatch.commit();

      await commitBoardBatches({
        shareId,
        boards: input.boards,
        scope: 'shareSubstituteCollection',
      });

      return shareId;
    },
    []
  );

  /**
   * Recipient action: fetch the share metadata doc.
   *
   * Returns a discriminated result so callers can distinguish definitively
   * "share doesn't exist" / "share has expired" from "we couldn't determine
   * its state" (rules denied, network failure, malformed payload). The
   * three failure cases warrant different user messaging — a teacher who
   * gets `unauthorized` should re-authenticate / contact the host, while
   * `not-found` means the link is invalid. Logs errors via logError so
   * production failures still surface in telemetry.
   */
  const loadSharedCollection = useCallback(
    async (shareId: string): Promise<LoadSharedCollectionResult> => {
      if (isAuthBypass) {
        const meta = mockCollStore.getCollection(shareId);
        if (!meta) return { ok: false, reason: 'not-found' };
        if (
          meta.intendedMode === 'substitute' &&
          meta.expiresAt &&
          meta.expiresAt < Date.now()
        ) {
          return { ok: false, reason: 'expired' };
        }
        return { ok: true, meta };
      }
      try {
        const parentRef = doc(db, SHARED_COLLECTIONS_SUBPATH, shareId);
        const snap = await getDoc(parentRef);
        if (!snap.exists()) return { ok: false, reason: 'not-found' };
        const data = snap.data() as SharedCollection;
        if (
          data.intendedMode === 'substitute' &&
          data.expiresAt &&
          data.expiresAt < Date.now()
        ) {
          return { ok: false, reason: 'expired' };
        }
        return { ok: true, meta: data };
      } catch (err) {
        logError('useSharedCollection.loadSharedCollection', err, { shareId });
        // Firestore SDK errors expose `code` on the rejection. A
        // `permission-denied` code means rules rejected the read — the
        // share likely exists but the recipient can't see it (e.g. token
        // expired, building scope mismatch). Distinguish so the caller can
        // tell the user to re-auth instead of "share doesn't exist".
        const code =
          err && typeof err === 'object' && 'code' in err
            ? (err as { code?: unknown }).code
            : undefined;
        if (code === 'permission-denied') {
          return { ok: false, reason: 'unauthorized' };
        }
        return { ok: false, reason: 'error' };
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
