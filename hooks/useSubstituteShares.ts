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
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { canonicalBuildingId } from '@/config/buildings';
import type {
  Dashboard,
  SharedBoardIntendedMode,
  SubstituteShareFields,
  SubstituteShareDriveGrant,
} from '@/types';

/**
 * Maps known Firestore error codes to user-friendly messages so that raw SDK
 * strings (e.g. "Missing or insufficient permissions.") never surface in the
 * UI. The original error is still passed to console.error for debugging.
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
        console.error('[useSubstituteShares] snapshot error:', err);
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
        console.error('[useSubstituteShare] snapshot error:', err);
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

/** Re-export for callers (e.g. Phase 5 Drive grant types). */
export type { SubstituteShareDriveGrant };
