/**
 * useSessionViewCount — fetches the count of view-tracking docs for a single
 * view-only session.
 *
 * The four assignment widgets (Quiz, Video Activity, Mini App, Guided
 * Learning) each persist anonymous view events to a `views/` subcollection on
 * their session doc whenever a student loads a view-only share URL. This
 * hook exposes that count so the teacher's Shared / Archive surface can
 * show "viewed N times" without adding a denormalized counter on the
 * session itself.
 *
 * Cost shape: one Firestore aggregation query (`getCountFromServer`) per
 * mounted card when `enabled === true`, gated behind a module-level cache
 * keyed by `${collectionName}:${sessionId}`. Re-renders re-use the cached
 * count; teachers can refresh by re-opening the tab (Library tabs unmount
 * and remount the cards).
 *
 * The hook is intentionally read-once: the user's stated need is "see how
 * many times the URL was opened" — a snapshot suffices and a live listener
 * would be a real-time write multiplier across the teacher's archive.
 */

import { useEffect, useState } from 'react';
import { collection, getCountFromServer } from 'firebase/firestore';
import { db } from '@/config/firebase';

export type ViewTrackingCollection =
  | 'quiz_sessions'
  | 'video_activity_sessions'
  | 'mini_app_sessions'
  | 'guided_learning_sessions';

interface CacheEntry {
  count: number | null;
  promise: Promise<number> | null;
}

// Module-level cache so the same sessionId rendered from multiple cards
// (or after a list re-render) doesn't fanout to repeat aggregation queries.
// Cleared on full page reload — sufficient lifetime for a teacher session.
const cache = new Map<string, CacheEntry>();

function cacheKey(collectionName: ViewTrackingCollection, sessionId: string) {
  return `${collectionName}:${sessionId}`;
}

export interface UseSessionViewCountResult {
  count: number | null;
  loading: boolean;
}

/**
 * @param collectionName Top-level Firestore session collection.
 * @param sessionId Session doc id whose `views/` subcollection should be counted.
 *   Pass `undefined` (or `enabled === false`) to skip the read entirely.
 * @param enabled When false the hook returns `{count: null, loading: false}`
 *   without issuing any query — used to gate the read on view-only mode.
 */
export function useSessionViewCount(
  collectionName: ViewTrackingCollection,
  sessionId: string | undefined,
  enabled: boolean
): UseSessionViewCountResult {
  // Resolved key for the current props — null when the hook is disabled.
  const key = enabled && sessionId ? cacheKey(collectionName, sessionId) : null;

  // The hook reads `count` and `loading` from `cache[key]` during render and
  // re-renders the consumer when the async fetch resolves via `bumpRevision`.
  // No synchronous setState lives in the effect body — the disable / key-
  // change paths just produce a different derived render output, while the
  // network resolution path bumps the revision counter from inside the
  // promise's `.then` callback (async, allowed).
  const [, setRevision] = useState(0);

  useEffect(() => {
    if (!key) return;

    const cached = cache.get(key);
    // Cache hit: nothing to do — the component already reads the resolved
    // count during render.
    if (cached?.count != null) return;

    let cancelled = false;

    // Coalesce concurrent mounts of the same sessionId onto a single query.
    const inFlight: Promise<number> =
      cached?.promise ??
      getCountFromServer(
        collection(db, collectionName, sessionId as string, 'views')
      ).then(
        (snap) => snap.data().count,
        (err: unknown) => {
          // Surface the failure to the caller as `count: 0` rather than
          // null — a zero-state UI ("0 views") is a fine soft-fail and
          // avoids broadcasting an empty cell. Logged for debugging.
          console.warn('[useSessionViewCount] count query failed', err);
          return 0;
        }
      );
    cache.set(key, { count: cached?.count ?? null, promise: inFlight });

    void inFlight.then((n) => {
      cache.set(key, { count: n, promise: null });
      if (!cancelled) {
        // Bump the revision so this consumer re-renders and reads the
        // fresh cache entry. Other mounted consumers re-render through
        // their own effect cleanup; React's render is idempotent.
        setRevision((r) => r + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [collectionName, sessionId, enabled, key]);

  if (!key) return { count: null, loading: false };
  const cached = cache.get(key);
  return {
    count: cached?.count ?? null,
    loading: cached?.count == null,
  };
}
