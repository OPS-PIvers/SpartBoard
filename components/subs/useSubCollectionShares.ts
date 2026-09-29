import { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { canonicalBuildingId } from '@/config/buildings';
import { logError } from '@/utils/logError';
import type { SharedCollection } from '@/types';

/** Matches useSubstituteShares: covers a stale-token race right after sign-in. */
const MAX_PERMISSION_DENIED_RETRIES = 3;

interface CollectionsSnapshot {
  buildingId: string;
  collections: SharedCollection[];
  errored: boolean;
}

export interface SubCollectionSharesState {
  collections: SharedCollection[];
  loading: boolean;
  errored: boolean;
}

/**
 * Live list of unexpired `/shared_collections` sub shares in a building,
 * single-board shares (`kind: 'board'`) included.
 */
export function useSubCollectionShares(
  buildingId: string
): SubCollectionSharesState {
  // Keyed by building so `loading` is derived rather than reset in an effect.
  const [snapshot, setSnapshot] = useState<CollectionsSnapshot | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const retryCountRef = useRef(0);
  const prevBuildingRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const canonical = canonicalBuildingId(buildingId);
    // Reset only on a real building change — retryToken also re-runs this.
    if (prevBuildingRef.current !== canonical) {
      retryCountRef.current = 0;
      prevBuildingRef.current = canonical;
    }
    // Live, not one-shot: the teacher can end a share or push new boards while
    // the sub has the directory open, and both have to show up without a
    // refresh. Firestore evaluates a list query's rule against the QUERY, not
    // the matched docs: only equality-pinned fields carry a value, so the
    // `shared_collections` `allow list` rule gates @orono callers on
    // `intendedMode` alone. Expiry is therefore ours to enforce — the
    // `where('expiresAt','>')` constraint (composite index provisioned in
    // firestore.indexes.json) plus the client-side filter below. Mirrors
    // useSubstituteShares.ts.
    const q = query(
      collection(db, 'shared_collections'),
      where('intendedMode', '==', 'substitute'),
      where('buildingId', '==', canonical),
      where('expiresAt', '>', Date.now())
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        retryCountRef.current = 0;
        const now = Date.now();
        const docs: SharedCollection[] = [];
        snap.docs.forEach((d) => {
          const data = d.data() as SharedCollection;
          const expiresAt =
            typeof data.expiresAt === 'number' ? data.expiresAt : 0;
          if (expiresAt <= now) return;
          docs.push({ ...data, shareId: d.id });
        });
        setSnapshot({
          buildingId: canonical,
          collections: docs,
          errored: false,
        });
      },
      (err) => {
        if (
          err.code === 'permission-denied' &&
          retryCountRef.current < MAX_PERMISSION_DENIED_RETRIES
        ) {
          retryCountRef.current += 1;
          setSnapshot(null);
          setRetryToken((token) => token + 1);
          return;
        }
        logError('useSubCollectionShares.subscribe', err, { buildingId });
        setSnapshot({ buildingId: canonical, collections: [], errored: true });
      }
    );
    return unsub;
  }, [buildingId, retryToken]);

  const canonical = canonicalBuildingId(buildingId);
  const settled =
    snapshot && snapshot.buildingId === canonical ? snapshot : null;
  return {
    collections: settled?.collections ?? [],
    loading: settled === null,
    errored: settled?.errored ?? false,
  };
}
