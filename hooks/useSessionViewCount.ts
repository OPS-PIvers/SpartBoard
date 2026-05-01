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
 * `(collection, sessionId)` pair, gated behind a module-level cache.
 * Subsequent mounts of the same session — including remount-after-unmount —
 * reuse the cached count. Three things bust the cache:
 *
 *   1. Explicit `invalidateSessionViewCount(collection, sessionId)` calls
 *      (wired into reactivate / reopen / unarchive callbacks so the count
 *      refreshes after a Closed share is brought back).
 *   2. Tab-visibility transitions back to `'visible'` (teacher comes back
 *      to the SpartBoard tab after sending the link out) — throttled to
 *      one refresh per `VISIBILITY_REFRESH_MIN_MS` so rapid alt-tab
 *      thrashing doesn't fan out N reads.
 *   3. Full page reload (cache is module-scoped, dies with the module).
 *
 * The hook is intentionally read-once-per-cache-bust: the user's stated
 * need is "see how many times the URL was opened" — a snapshot per
 * focus-cycle suffices, and a live `onSnapshot` listener would be a real-
 * time write multiplier across the teacher's archive.
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
const cache = new Map<string, CacheEntry>();

function cacheKey(collectionName: ViewTrackingCollection, sessionId: string) {
  return `${collectionName}:${sessionId}`;
}

/**
 * Drop the cached view count for a session so the next mount of
 * `useSessionViewCount` re-issues the aggregation query. Wire this into
 * status-change callbacks (Reactivate, Reopen, etc.) where the count is
 * expected to grow again after the call — without it, teachers would see
 * the pre-Closed count forever even as new students hit the link.
 */
export function invalidateSessionViewCount(
  collectionName: ViewTrackingCollection,
  sessionId: string
): void {
  cache.delete(cacheKey(collectionName, sessionId));
}

/* ─── Visibility-driven cross-hook refresh ────────────────────────────────── */

/** Minimum gap between visibility-driven cache flushes. Prevents rapid
 *  alt-tab cycling from thrashing Firestore reads — each return to the
 *  SpartBoard tab inside this window is a no-op. Tuned for "teacher came
 *  back to check the dashboard": longer is fine, shorter is wasteful. */
const VISIBILITY_REFRESH_MIN_MS = 5000;

const subscribers = new Set<() => void>();
let lastVisibilityRefreshAt = 0;

/**
 * Internal: invoked by the visibility listener (and by tests) to clear the
 * cache and notify every mounted hook to re-run its fetch effect. Throttled
 * via `lastVisibilityRefreshAt` so rapid focus changes don't multiply reads.
 *
 * Exported only for tests — production code should never call this
 * directly; the `'visibilitychange'` listener registered at module load is
 * the sole production trigger.
 */
export function _testVisibilityRefresh(now: number = Date.now()): boolean {
  if (now - lastVisibilityRefreshAt < VISIBILITY_REFRESH_MIN_MS) return false;
  lastVisibilityRefreshAt = now;
  cache.clear();
  subscribers.forEach((cb) => cb());
  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    // Only act on hidden → visible transitions. The reverse triggers no
    // user-facing work (the dashboard is hidden) and would just shorten
    // the throttle window for the next legitimate refresh.
    if (document.visibilityState !== 'visible') return;
    _testVisibilityRefresh();
  });
}

/* ─── Hook ────────────────────────────────────────────────────────────────── */

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
  // re-renders the consumer when the async fetch resolves (via the promise
  // `.then` bumping `revision`) or when a global cache flush fires (via the
  // visibility-subscriber callback bumping `revision`). No synchronous
  // setState lives in the effect body — the disable / key-change paths just
  // produce a different derived render output.
  const [revision, setRevision] = useState(0);

  // Subscribe to global cache flushes (currently driven only by the tab
  // visibility listener at module scope). Bumping `revision` re-runs the
  // fetch effect; with the cache now cleared, that effect issues a fresh
  // aggregation query.
  useEffect(() => {
    const cb = () => setRevision((r) => r + 1);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  useEffect(() => {
    if (!key) return;

    // Early-return on EITHER a resolved count OR an in-flight promise. The
    // promise check is what makes the coalescing actually work under React
    // 18 StrictMode (and any concurrent mount): without it, two effects
    // racing through `cache.get(key)` before either has set `promise` would
    // each call `getCountFromServer`, doubling Firestore reads in dev.
    const cached = cache.get(key);
    if (cached?.count != null) return;
    if (cached?.promise) {
      // Coalesce: hitch a ride on the in-flight promise so this consumer
      // re-renders when it resolves, but don't fire a second query.
      let cancelled = false;
      void cached.promise.then(() => {
        if (!cancelled) setRevision((r) => r + 1);
      });
      return () => {
        cancelled = true;
      };
    }

    // Cache miss + no in-flight: claim the slot synchronously by writing
    // the promise BEFORE awaiting, so a concurrent mount sees it.
    const inFlight: Promise<number> = getCountFromServer(
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
    cache.set(key, { count: null, promise: inFlight });

    let cancelled = false;
    void inFlight.then((n) => {
      cache.set(key, { count: n, promise: null });
      if (!cancelled) setRevision((r) => r + 1);
    });

    return () => {
      cancelled = true;
    };
    // `revision` participates so a global cache flush (visibility refresh,
    // or any future trigger) re-runs this effect against the empty cache.
  }, [collectionName, sessionId, enabled, key, revision]);

  if (!key) return { count: null, loading: false };
  const cached = cache.get(key);
  return {
    count: cached?.count ?? null,
    loading: cached?.count == null,
  };
}
