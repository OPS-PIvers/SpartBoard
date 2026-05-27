import { useEffect, useRef, useState, useCallback } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import type { DrawableObject } from '@/types';

/**
 * Phase 2 PR 2.6 — Firestore subcollection hook for DrawingWidget objects.
 *
 * Subscribes to the page-nested `/objects` subcollection so a single
 * drawn shape is one Firestore write rather than a full dashboard-doc
 * rewrite. The path is page-scoped:
 *
 *   /users/{uid}/dashboards/{dashboardId}/drawings/{widgetId}/pages/{pageId}/objects/{objectId}
 *
 * Page-level metadata (background template) lives on the parent
 * `/pages/{pageId}` doc — see `useDrawingPageDoc` for that sibling hook
 * (added when needed; not part of Wave 8's MVP).
 *
 * Subscription lifecycle: we keep an LRU of up to 2 active page
 * subscriptions (current + previous) so fast forward/back navigation does
 * not tear down the listener users just left and immediately rebuild it.
 * Older listeners are torn down so a teacher who pages through a 20-page
 * deck does not leak 20 listeners.
 *
 * AnnotationOverlay is intentionally NOT migrated to this hook: annotation
 * objects remain on the dashboard document under `annotationOverlay`. See
 * `context/DashboardContext.tsx` for the annotation persistence path.
 *
 * KNOWN LIMITATION (synced-board viewers — slice 1 N1):
 * This hook always reads from `/users/{current-user-uid}/...`. For a synced
 * board where the host has migrated to the subcollection, a viewer/
 * collaborator (under their own uid) will see an empty drawing — the
 * Firestore rules at `firestore.rules` deny cross-user reads, and the
 * mirrored dashboard doc's `pages[].objects[]` is stripped post-migration.
 * Synced-share of drawing CONTENT is therefore broken after the host's
 * migration runs. AnnotationOverlay (which IS mirrored through the
 * shared_boards doc) is unaffected.
 *
 * TODO (post-2.6): either (a) include actual `objects[]` in the mirrored
 * dashboard payload for synced boards (host serializes pre-migration shape
 * into the mirror), or (b) extend Firestore rules + this hook with a
 * `hostUid` option for cross-user reads under the shared-board contract.
 * Tracked in PR #1685 review round 2 (slice 1 finding N1).
 */

const FIRESTORE_BATCH_LIMIT = 450;

interface UseDrawingObjectsDocOptions {
  /** Dashboard owning this widget. When null/empty the hook stays idle. */
  dashboardId: string | null | undefined;
  /** Widget id (per `WidgetData.id`). */
  widgetId: string;
  /** Page id (per `DrawingPage.id`). */
  pageId: string | null | undefined;
}

interface UseDrawingObjectsDocResult {
  objects: DrawableObject[];
  addObject: (obj: DrawableObject) => Promise<void>;
  updateObject: (next: DrawableObject) => Promise<void>;
  removeObject: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  loading: boolean;
}

// LRU subscription cache — keeps at most LRU_MAX live listeners per
// (uid, dashboardId, widgetId). Keyed by a composite cache key so unrelated
// widgets don't share an eviction budget. Modules are singletons in Vite, so
// this map persists across hook remounts.
const LRU_MAX = 2;

/**
 * Per-instance subscriber callbacks. Each hook instance currently subscribed
 * to a cache entry registers a pair here; the entry's `onSnapshot` callback
 * fans out to every registered subscriber. This means:
 *   - The shared listener can't accidentally call setState on an UNMOUNTED
 *     hook instance — cleanup unregisters before unmount completes.
 *   - Multiple live consumers of the same page (e.g. live-share viewer + host
 *     in the same tab, or React StrictMode's double-mount) all observe the
 *     latest data, not just the instance that opened the listener.
 */
interface EntrySubscriber {
  setObjects: (next: DrawableObject[]) => void;
  setLoading: (next: boolean) => void;
}

/**
 * Cache entry for an active page subscription.
 *
 * - `unsubscribe` / `refs`: lifecycle for the underlying `onSnapshot`.
 * - `lastObjects`: the most-recent snapshot data, mirrored here so a new
 *   consumer who hits a warm cache entry (back-navigation within the LRU
 *   window) can hydrate `objects` synchronously instead of waiting for the
 *   next remote re-emission. `null` until the first snapshot arrives.
 * - `subscribers`: the live hook instances reading from this entry. The
 *   `onSnapshot` callback iterates this set rather than closing over any
 *   single instance's setState — so an unmounted instance can never be
 *   pushed an update.
 */
type ActiveSub = {
  unsubscribe: Unsubscribe;
  refs: number;
  lastObjects: DrawableObject[] | null;
  subscribers: Set<EntrySubscriber>;
};
const activeSubsByContext = new Map<string, Map<string, ActiveSub>>();

const subContextKey = (uid: string, dashboardId: string, widgetId: string) =>
  `${uid}::${dashboardId}::${widgetId}`;

/**
 * Test-only escape hatch: clear the module-level LRU cache between vitest
 * runs so per-test state can't leak. Not exported through the public hook
 * surface — only the test file should import this symbol.
 */
export const __resetForTests = () => {
  for (const ctx of activeSubsByContext.values()) {
    for (const sub of ctx.values()) {
      try {
        sub.unsubscribe();
      } catch {
        // best-effort: tests routinely use stubbed unsubscribe fns
      }
    }
  }
  activeSubsByContext.clear();
};

const evictOldestIfFull = (contextMap: Map<string, ActiveSub>) => {
  while (contextMap.size >= LRU_MAX) {
    // Map iteration order is insertion order. The oldest entry is the first
    // key; evict the first entry whose refcount has dropped to 0 (no live
    // consumer). If every entry still has consumers, abort the eviction
    // pass — we never tear down a listener someone is actively reading from.
    let evicted = false;
    for (const [key, sub] of contextMap.entries()) {
      if (sub.refs === 0) {
        sub.unsubscribe();
        contextMap.delete(key);
        evicted = true;
        break;
      }
    }
    if (!evicted) break;
  }
};

export const useDrawingObjectsDoc = ({
  dashboardId,
  widgetId,
  pageId,
}: UseDrawingObjectsDocOptions): UseDrawingObjectsDocResult => {
  const { user } = useAuth();
  const uid = user?.uid;

  // Initialize state from preconditions so the idle case never has to call
  // setState inside an effect (sidesteps the react-hooks/set-state-in-effect
  // lint flag). When preconditions become satisfied, the active branch of
  // the effect below transitions loading via cache-reuse hydration or via
  // the snapshot callback — both legitimate external-system synchronization
  // sites that the rule has no quarrel with.
  const hasPreconditions = !!uid && !!dashboardId && !!pageId;
  const [objects, setObjects] = useState<DrawableObject[]>([]);
  const [loading, setLoading] = useState(hasPreconditions);

  // Track which (dashboardId, widgetId, pageId) tuple this hook instance is
  // subscribed to so the cleanup path can decrement the right refcount even
  // after the props have already changed.
  const subscribedKeyRef = useRef<{
    contextKey: string;
    pageId: string;
  } | null>(null);

  useEffect(() => {
    if (!uid || !dashboardId || !pageId) {
      // Hook is parked — synchronize local state with the absence of the
      // subscription. The functional updaters short-circuit when the new
      // value would match the old, so re-renders only fire when state
      // actually changes (e.g. props going from active → idle mid-session).
      // The rule's heuristic flags only the FIRST setState site in this
      // particular control-flow branch (the parked-idle reset); subsequent
      // setStates in the same branch reuse the diagnostic — verified by
      // running `pnpm run lint` against this file. The single suppression
      // below covers the cluster.
      subscribedKeyRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setObjects((prev) => (prev.length === 0 ? prev : []));
      setLoading((prev) => (prev ? false : prev));
      return;
    }

    const contextKey = subContextKey(uid, dashboardId, widgetId);
    let contextMap = activeSubsByContext.get(contextKey);
    if (!contextMap) {
      contextMap = new Map();
      activeSubsByContext.set(contextKey, contextMap);
    }

    let entry = contextMap.get(pageId);
    const isCacheReuse = !!entry;
    if (!entry) {
      evictOldestIfFull(contextMap);
      const colRef = collection(
        db,
        'users',
        uid,
        'dashboards',
        dashboardId,
        'drawings',
        widgetId,
        'pages',
        pageId,
        'objects'
      );
      // Pre-create the entry so the snapshot callback can populate
      // `lastObjects` + fan out to subscribers on the very first emission.
      const newEntry: ActiveSub = {
        // Reassigned below after onSnapshot returns.
        unsubscribe: () => undefined,
        refs: 0,
        lastObjects: null,
        subscribers: new Set<EntrySubscriber>(),
      };
      const unsubscribe = onSnapshot(
        colRef,
        (snapshot) => {
          const next = snapshot.docs.map((d) => d.data() as DrawableObject);
          // Stable z-order: callers expect ascending z (last-on-top render).
          next.sort((a, b) => a.z - b.z);
          newEntry.lastObjects = next;
          // Fan out to every live subscriber. Unmounted hook instances are
          // removed from this set by their effect cleanup BEFORE unmount
          // commits, so a setState on an unmounted component is impossible
          // by construction.
          for (const sub of newEntry.subscribers) {
            sub.setObjects(next);
            sub.setLoading(false);
          }
        },
        (err) => {
          logError('useDrawingObjectsDoc.subscription', err, {
            dashboardId,
            widgetId,
            pageId,
          });
          for (const sub of newEntry.subscribers) {
            sub.setLoading(false);
          }
        }
      );
      newEntry.unsubscribe = unsubscribe;
      contextMap.set(pageId, newEntry);
      entry = newEntry;
    }
    entry.refs += 1;
    const subscriber: EntrySubscriber = { setObjects, setLoading };
    entry.subscribers.add(subscriber);
    subscribedKeyRef.current = { contextKey, pageId };

    if (isCacheReuse && entry.lastObjects !== null) {
      // Hydrate from the cache entry synchronously. If a snapshot has
      // already fired for this entry, replay it so the consumer sees the
      // data immediately instead of waiting for the next server emission
      // (which may never come if the page is static).
      setObjects(entry.lastObjects);
      setLoading(false);
    } else {
      // Fresh subscribe (or warm entry that hasn't received its first
      // snapshot yet) — the snapshot callback will flip loading=false when
      // it fires.
      setLoading(true);
    }

    return () => {
      const subKey = subscribedKeyRef.current;
      if (!subKey) return;
      const cm = activeSubsByContext.get(subKey.contextKey);
      if (!cm) return;
      const e = cm.get(subKey.pageId);
      if (!e) return;
      e.subscribers.delete(subscriber);
      e.refs -= 1;
      // Eviction within the LRU window is deferred to the next subscribe —
      // keeping the listener around costs only a handful of bytes and lets
      // back-navigation reuse the cached data. But if the entire widget has
      // unmounted (no remaining refs across any page in this context), we
      // must tear down all of its listeners so Firestore reads don't leak
      // for the lifetime of the tab. Defer to a microtask so a back-to-back
      // unmount + remount (e.g. a page switch) sees the new subscribe
      // increment a ref BEFORE we check the total.
      const ctxKey = subKey.contextKey;
      queueMicrotask(() => {
        const currentCm = activeSubsByContext.get(ctxKey);
        if (!currentCm) return;
        let totalRefs = 0;
        for (const sub of currentCm.values()) totalRefs += sub.refs;
        if (totalRefs > 0) return;
        for (const sub of currentCm.values()) sub.unsubscribe();
        activeSubsByContext.delete(ctxKey);
      });
    };
  }, [uid, dashboardId, widgetId, pageId]);

  const buildDocRef = useCallback(
    (objectId: string) => {
      if (!uid || !dashboardId || !pageId) return null;
      return doc(
        db,
        'users',
        uid,
        'dashboards',
        dashboardId,
        'drawings',
        widgetId,
        'pages',
        pageId,
        'objects',
        objectId
      );
    },
    [uid, dashboardId, widgetId, pageId]
  );

  const addObject = useCallback(
    async (obj: DrawableObject) => {
      const ref = buildDocRef(obj.id);
      if (!ref) return;
      await setDoc(ref, obj);
    },
    [buildDocRef]
  );

  const updateObject = useCallback(
    async (next: DrawableObject) => {
      const ref = buildDocRef(next.id);
      if (!ref) return;
      // merge: true so partial updates (e.g. a transform-commit that only
      // touches geometry) don't clobber unrelated fields. Note that the
      // current callers always pass full objects, but merge keeps the
      // contract robust against future partial-update call sites.
      await setDoc(ref, next, { merge: true });
    },
    [buildDocRef]
  );

  const removeObject = useCallback(
    async (id: string) => {
      const ref = buildDocRef(id);
      if (!ref) return;
      await deleteDoc(ref);
    },
    [buildDocRef]
  );

  const clear = useCallback(async () => {
    if (!uid || !dashboardId || !pageId) return;
    // Builds the delete list from the React-state `objects` array (closure
    // capture at render time). For the current single-tab teacher CRUD use
    // case this is correct — there is no concurrent writer that could add
    // an object between the React render and this batch commit. If we ever
    // open the DrawingWidget to multi-tab or remote writes, switch to
    // `getDocs(colRef)` immediately before batching so concurrent inserts
    // don't survive Clear-All.
    const ids = objects.map((o) => o.id);
    if (ids.length === 0) return;
    for (let i = 0; i < ids.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      const slice = ids.slice(i, i + FIRESTORE_BATCH_LIMIT);
      for (const id of slice) {
        const ref = doc(
          db,
          'users',
          uid,
          'dashboards',
          dashboardId,
          'drawings',
          widgetId,
          'pages',
          pageId,
          'objects',
          id
        );
        batch.delete(ref);
      }
      await batch.commit();
    }
  }, [uid, dashboardId, widgetId, pageId, objects]);

  return { objects, addObject, updateObject, removeObject, clear, loading };
};
