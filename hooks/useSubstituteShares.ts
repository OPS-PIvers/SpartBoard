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

import { useEffect, useRef, useState } from 'react';
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

const MAX_PERMISSION_DENIED_RETRIES = 3;

/**
 * Live list of substitute shares in the given building. The `shared_boards`
 * read rule now gates @orono callers on `expiresAt > request.time` (mirrors
 * `shared_collections`) — Firestore evaluates a list query's rule against
 * every matched doc and fails the WHOLE query if any one is denied, so the
 * `where('expiresAt', '>')` constraint below keeps expired docs out of the
 * result set entirely (composite index provisioned in firestore.indexes.json).
 * The client-side filter stays as belt-and-suspenders for the narrow
 * clock-skew window. Mirrors `SubCollectionsList.tsx`.
 *
 * `Date.now()` is only captured when this effect (re)runs, so a share that
 * expires WHILE the listener is open stays inside the frozen query filter.
 * If `expireSubShares.ts` later writes to that (now rule-ineligible) doc,
 * Firestore re-evaluates the rule for the write and denies the WHOLE query
 * with `permission-denied` — confirmed empirically against the emulator, not
 * just a silent per-doc removal. Re-subscribing with a fresh `Date.now()`
 * baseline (which naturally excludes the newly-expired doc) recovers
 * transparently. The retry count lives in a ref (not state) so resetting it
 * to 0 on a successful snapshot never itself triggers an effect re-run —
 * only `retryToken` (bumped exclusively on a denial that should retry) tears
 * down and rebuilds the listener; a capped ref count falls through to the
 * friendly error for a genuine, non-expiry permission problem.
 */
export function useSubstituteShares(
  buildingId: string
): UseSubstituteSharesState {
  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const retryCountRef = useRef(0);
  const prevBuildingIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Reset the retry budget only on an actual buildingId change — this
    // effect also re-runs on a retryToken bump (the retry itself), and
    // resetting unconditionally there would defeat the retry cap.
    if (prevBuildingIdRef.current !== buildingId) {
      retryCountRef.current = 0;
      prevBuildingIdRef.current = buildingId;
    }
    if (!buildingId) return;
    const canonical = canonicalBuildingId(buildingId);
    const q = query(
      collection(db, 'shared_boards'),
      where('intendedMode', '==', 'substitute' as SharedBoardIntendedMode),
      where('buildingId', '==', canonical),
      where('expiresAt', '>', Date.now())
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        retryCountRef.current = 0;
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
        if (
          err.code === 'permission-denied' &&
          retryCountRef.current < MAX_PERMISSION_DENIED_RETRIES
        ) {
          retryCountRef.current += 1;
          // Clear the stale snapshot so callers see loading instead of the
          // old list (which may include the now-expired, no-longer-readable
          // doc that triggered this denial) until the re-subscribe resolves.
          setSnapshot(null);
          setRetryToken((t) => t + 1);
          return;
        }
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
  }, [buildingId, retryToken]);

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
  // A permission-denied for a substitute share most likely means expiresAt
  // lapsed — the non-Orono, non-host, non-admin case is an edge (subs portal
  // is district-gated), but worth distinguishing in the UI message if needed.
  permissionDeniedLikelyExpired: boolean;
}

interface SingleSnapshot {
  shareId: string;
  share: SubstituteShareDoc | null;
  error: string | null;
  permissionDeniedLikelyExpired: boolean;
}

/** Live single-doc subscription for the sub-board view. */
export function useSubstituteShare(
  shareId: string | null,
  // Non-nullable: the building gate is a security control (see
  // useSubstituteCollectionBoard). The shared_boards read rule has no building
  // constraint, so any @orono user can fetch any unexpired substitute share by
  // id — reject docs whose building doesn't match the directory the sub is in.
  expectedBuildingId: string
): UseSubstituteShareState {
  const [snapshot, setSnapshot] = useState<SingleSnapshot | null>(null);

  useEffect(() => {
    if (!shareId) return;
    const ref = doc(db, 'shared_boards', shareId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setSnapshot({
            shareId,
            share: null,
            error: 'Share not found',
            permissionDeniedLikelyExpired: false,
          });
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        if (data.intendedMode !== 'substitute') {
          setSnapshot({
            shareId,
            share: null,
            error: 'Not a substitute share',
            permissionDeniedLikelyExpired: false,
          });
          return;
        }
        // Defense-in-depth cross-building gate (mirrors
        // useSubstituteCollectionBoard). Fail closed: a missing/blank or
        // mismatched buildingId yields the error state rather than loading.
        const docBuildingId =
          typeof data.buildingId === 'string' ? data.buildingId : '';
        if (
          !docBuildingId ||
          canonicalBuildingId(docBuildingId) !==
            canonicalBuildingId(expectedBuildingId)
        ) {
          setSnapshot({
            shareId,
            share: null,
            error: 'This share is not available in your building.',
            permissionDeniedLikelyExpired: false,
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
          permissionDeniedLikelyExpired: false,
        });
      },
      (err) => {
        logError('useSubstituteShare.snapshot', err, { shareId });
        setSnapshot({
          shareId,
          share: null,
          error: friendlySubShareError(err),
          permissionDeniedLikelyExpired: err.code === 'permission-denied',
        });
      }
    );
    return unsub;
  }, [shareId, expectedBuildingId]);

  if (!shareId) {
    return {
      share: null,
      loading: false,
      error: null,
      permissionDeniedLikelyExpired: false,
    };
  }
  if (!snapshot || snapshot.shareId !== shareId) {
    return {
      share: null,
      loading: true,
      error: null,
      permissionDeniedLikelyExpired: false,
    };
  }
  return {
    share: snapshot.share,
    loading: false,
    error: snapshot.error,
    permissionDeniedLikelyExpired: snapshot.permissionDeniedLikelyExpired,
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
  // Non-nullable: the building gate is a security control, so the type forces
  // every caller to supply a building rather than silently failing open on
  // null. (shareId/boardId stay nullable — the hook early-returns on those.)
  expectedBuildingId: string
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
          !parent.buildingId ||
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
