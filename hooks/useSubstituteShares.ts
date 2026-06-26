/**
 * Substitute-share read hooks for the `/subs` portal.
 *
 * - `useSubstituteShares(buildingId)` — live list of un-expired substitute
 *   shares in the given building, ordered by `sharedAt` desc.
 * - `useSubstituteShare(shareId)` — live single-doc subscription for the
 *   sub-board view.
 *
 * Schema: see `SubstituteShareFields` in types.ts. Reads are auth-gated
 * by `firestore.rules` (`allow read: if request.auth != null`).
 */

import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { canonicalBuildingId } from '@/config/buildings';
import { logError } from '@/utils/logError';
import type {
  Dashboard,
  SharedBoardIntendedMode,
  SharedCollection,
  SharedCollectionBoardDoc,
  SubstituteShareFields,
  SubstituteShareDriveGrant,
} from '@/types';

/**
 * Maps known Firestore error codes to user-friendly messages so that raw SDK
 * strings (e.g. "Missing or insufficient permissions.") never surface in the
 * UI. The original error is still reported via logError for debugging.
 */
function friendlySubShareError(err: {
  code?: string;
  message?: string;
}): string {
  switch (err.code) {
    case 'permission-denied':
      return 'You do not have permission to view this board.';
    case 'unavailable':
      return 'Could not reach the server. Check your internet connection.';
    case 'not-found':
      return 'This board could not be found.';
    default:
      return 'This board could not be loaded.';
  }
}

/**
 * Firestore-side shape of a substitute share doc. The persisted widgets
 * array doubles as `initialState` at creation time — we trust the latter
 * to deep-clone from on Reset and never mutate it.
 */
export interface SubstituteShareDoc
  extends Omit<Dashboard, 'id'>, Partial<SubstituteShareFields> {
  shareId: string;
  intendedMode?: SharedBoardIntendedMode;
  originalAuthor?: string;
  originalAuthorName?: string;
  sharedAt?: number;
  widgetCount?: number;
}

interface UseSubstituteSharesState {
  shares: SubstituteShareDoc[];
  loading: boolean;
  error: string | null;
}

interface ShareSnapshot {
  buildingId: string;
  shares: SubstituteShareDoc[];
  error: string | null;
}

/**
 * Live list of substitute shares in the given building. Filters expired
 * shares client-side (Firestore can't do `expiresAt > now` plus building
 * scoping without a composite index — the result set is small in practice,
 * so client filtering is fine).
 */
export function useSubstituteShares(
  buildingId: string
): UseSubstituteSharesState {
  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null);

  useEffect(() => {
    if (!buildingId) return;
    const canonical = canonicalBuildingId(buildingId);
    const q = query(
      collection(db, 'shared_boards'),
      where('intendedMode', '==', 'substitute' as SharedBoardIntendedMode),
      where('buildingId', '==', canonical)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        const shares: SubstituteShareDoc[] = [];
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const expiresAt =
            typeof data.expiresAt === 'number' ? data.expiresAt : 0;
          if (expiresAt <= now) return;
          shares.push({
            ...(data as Omit<SubstituteShareDoc, 'shareId'>),
            shareId: d.id,
          });
        });
        shares.sort((a, b) => (b.sharedAt ?? 0) - (a.sharedAt ?? 0));
        setSnapshot({ buildingId: canonical, shares, error: null });
      },
      (err) => {
        logError('useSubstituteShares.snapshot', err, {
          buildingId: canonical,
        });
        setSnapshot({
          buildingId: canonical,
          shares: [],
          error: friendlySubShareError(err),
        });
      }
    );
    return unsub;
  }, [buildingId]);

  if (!buildingId) {
    return { shares: [], loading: false, error: null };
  }
  const canonical = canonicalBuildingId(buildingId);
  if (!snapshot || snapshot.buildingId !== canonical) {
    return { shares: [], loading: true, error: null };
  }
  return {
    shares: snapshot.shares,
    loading: false,
    error: snapshot.error,
  };
}

interface UseSubstituteShareState {
  share: SubstituteShareDoc | null;
  loading: boolean;
  error: string | null;
}

interface SingleSnapshot {
  shareId: string;
  share: SubstituteShareDoc | null;
  error: string | null;
}

/** Live single-doc subscription for the sub-board view. */
export function useSubstituteShare(
  shareId: string | null
): UseSubstituteShareState {
  const [snapshot, setSnapshot] = useState<SingleSnapshot | null>(null);

  useEffect(() => {
    if (!shareId) return;
    const ref = doc(db, 'shared_boards', shareId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setSnapshot({ shareId, share: null, error: 'Share not found' });
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        if (data.intendedMode !== 'substitute') {
          setSnapshot({
            shareId,
            share: null,
            error: 'Not a substitute share',
          });
          return;
        }
        setSnapshot({
          shareId,
          share: {
            ...(data as Omit<SubstituteShareDoc, 'shareId'>),
            shareId: snap.id,
          },
          error: null,
        });
      },
      (err) => {
        logError('useSubstituteShare.snapshot', err, { shareId });
        setSnapshot({
          shareId,
          share: null,
          error: friendlySubShareError(err),
        });
      }
    );
    return unsub;
  }, [shareId]);

  if (!shareId) {
    return { share: null, loading: false, error: null };
  }
  if (!snapshot || snapshot.shareId !== shareId) {
    return { share: null, loading: true, error: null };
  }
  return {
    share: snapshot.share,
    loading: false,
    error: snapshot.error,
  };
}

interface UseSubstituteCollectionBoardState {
  share: SubstituteShareDoc | null;
  loading: boolean;
  error: string | null;
}

interface CollectionBoardSnapshot {
  key: string;
  share: SubstituteShareDoc | null;
  error: string | null;
}

/**
 * One-shot loader for a single Board inside a substitute-mode
 * `/shared_collections/{shareId}` doc, shaped as a {@link SubstituteShareDoc}
 * so it can be fed straight into `SubsDashboardProvider` / `SubBoardCanvas` —
 * the exact same render pipeline a single-board substitute share uses.
 *
 * Unlike `useSubstituteShare`, this does NOT subscribe. Collection shares are
 * frozen one-shot snapshots (see `useSharedCollection` — no onSnapshot), so a
 * single `getDoc` pair (parent meta + the one board sub-doc) is the right read.
 *
 * The parent doc carries the share-level metadata (intendedMode, expiresAt,
 * buildingId, hostDisplayName); the board sub-doc carries the frozen
 * `Dashboard`. We splice them into the `SubstituteShareDoc` contract:
 *   - widgets / background / settings / etc. come from the board's Dashboard
 *   - expiresAt / buildingId / originalAuthor(+Name) come from the parent
 *   - `initialState` is seeded from the board's widgets so the sub's
 *     "Reset board" deep-clones from the same baseline.
 */
export function useSubstituteCollectionBoard(
  shareId: string | null,
  boardId: string | null,
  expectedBuildingId: string | null
): UseSubstituteCollectionBoardState {
  const [snapshot, setSnapshot] = useState<CollectionBoardSnapshot | null>(
    null
  );

  const key = shareId && boardId ? `${shareId}::${boardId}` : '';

  useEffect(() => {
    if (!shareId || !boardId) return;
    let cancelled = false;
    const requestKey = `${shareId}::${boardId}`;

    void (async () => {
      try {
        const parentRef = doc(db, 'shared_collections', shareId);
        const parentSnap = await getDoc(parentRef);
        if (cancelled) return;
        if (!parentSnap.exists()) {
          setSnapshot({
            key: requestKey,
            share: null,
            error: 'This Collection could not be found.',
          });
          return;
        }
        const parent = parentSnap.data() as SharedCollection;
        if (parent.intendedMode !== 'substitute') {
          setSnapshot({
            key: requestKey,
            share: null,
            error: 'Not a substitute Collection share.',
          });
          return;
        }
        // Substitute shares always carry `expiresAt` (enforced by the create
        // rule), so a missing value means a malformed/out-of-band doc — treat
        // it as expired rather than letting it load indefinitely.
        if (!parent.expiresAt || parent.expiresAt <= Date.now()) {
          setSnapshot({
            key: requestKey,
            share: null,
            error: 'This share has expired.',
          });
          return;
        }
        if (!parent.boardIds.includes(boardId)) {
          setSnapshot({
            key: requestKey,
            share: null,
            error: 'This board is not part of the shared Collection.',
          });
          return;
        }
        // Defense-in-depth: the shared_collections read rule has no building
        // constraint, so any @orono user can fetch any unexpired substitute
        // doc by id. A sub with a stale URL or hand-built navigation state
        // could otherwise load a share from a different building. Reject when
        // the doc's building doesn't match the directory the sub is viewing.
        if (
          expectedBuildingId &&
          parent.buildingId &&
          canonicalBuildingId(parent.buildingId) !==
            canonicalBuildingId(expectedBuildingId)
        ) {
          setSnapshot({
            key: requestKey,
            share: null,
            error: 'This share is not available in your building.',
          });
          return;
        }

        const boardRef = doc(
          db,
          'shared_collections',
          shareId,
          'boards',
          boardId
        );
        const boardSnap = await getDoc(boardRef);
        if (cancelled) return;
        if (!boardSnap.exists()) {
          setSnapshot({
            key: requestKey,
            share: null,
            error: 'This board could not be found in the Collection.',
          });
          return;
        }
        const boardData = boardSnap.data() as SharedCollectionBoardDoc;
        const board = boardData.dashboard;
        const widgets = Array.isArray(board.widgets) ? board.widgets : [];

        // Splice parent metadata + frozen board into the SubstituteShareDoc
        // shape SubsDashboardProvider already understands. `id` is omitted by
        // the Omit<Dashboard,'id'> base; shareId stands in for it.
        const { id: _boardDocId, ...boardWithoutId } = board;
        const share: SubstituteShareDoc = {
          ...boardWithoutId,
          widgets,
          shareId: parent.shareId,
          intendedMode: 'substitute',
          buildingId: parent.buildingId,
          expiresAt: parent.expiresAt,
          initialState: widgets,
          originalAuthor: parent.hostUid,
          ...(parent.hostDisplayName
            ? { originalAuthorName: parent.hostDisplayName }
            : {}),
          name: board.name ?? parent.collection.name,
        };

        setSnapshot({ key: requestKey, share, error: null });
      } catch (err) {
        logError('useSubstituteCollectionBoard.load', err, {
          shareId,
          boardId,
        });
        if (!cancelled) {
          setSnapshot({
            key: requestKey,
            share: null,
            error: friendlySubShareError(
              err as { code?: string; message?: string }
            ),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareId, boardId, expectedBuildingId]);

  if (!shareId || !boardId) {
    return { share: null, loading: false, error: null };
  }
  if (!snapshot || snapshot.key !== key) {
    return { share: null, loading: true, error: null };
  }
  return {
    share: snapshot.share,
    loading: false,
    error: snapshot.error,
  };
}

/** Re-export for callers (e.g. Phase 5 Drive grant types). */
export type { SubstituteShareDriveGrant };
