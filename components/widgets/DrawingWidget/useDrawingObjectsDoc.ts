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
type ActiveSub = {
  unsubscribe: Unsubscribe;
  refs: number;
};
const activeSubsByContext = new Map<string, Map<string, ActiveSub>>();

const subContextKey = (uid: string, dashboardId: string, widgetId: string) =>
  `${uid}::${dashboardId}::${widgetId}`;

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

  const [objects, setObjects] = useState<DrawableObject[]>([]);
  const [loading, setLoading] = useState(true);

  // Track which (dashboardId, widgetId, pageId) tuple this hook instance is
  // subscribed to so the cleanup path can decrement the right refcount even
  // after the props have already changed.
  const subscribedKeyRef = useRef<{
    contextKey: string;
    pageId: string;
  } | null>(null);

  useEffect(() => {
    if (!uid || !dashboardId || !pageId) {
      // No active subscription — reset to the empty/idle baseline. The
      // setState calls are the standard "drop external subscription"
      // pattern: synchronizing with the absence of the external system
      // is still synchronizing with it, so the lint rule's false positive
      // here is suppressed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setObjects([]);

      setLoading(false);
      return;
    }

    // Mark the new subscription as "loading until first snapshot"
    // synchronously so a render between subscribe and the snapshot
    // callback shows the spinner instead of a stale page. Same lint
    // suppression rationale: this IS the synchronization edge.

    setLoading(true);

    const contextKey = subContextKey(uid, dashboardId, widgetId);
    let contextMap = activeSubsByContext.get(contextKey);
    if (!contextMap) {
      contextMap = new Map();
      activeSubsByContext.set(contextKey, contextMap);
    }

    let entry = contextMap.get(pageId);
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
      const unsubscribe = onSnapshot(
        colRef,
        (snapshot) => {
          const next = snapshot.docs.map((d) => d.data() as DrawableObject);
          // Stable z-order: callers expect ascending z (last-on-top render).
          next.sort((a, b) => a.z - b.z);
          setObjects(next);
          setLoading(false);
        },
        (err) => {
          console.error('[useDrawingObjectsDoc] subscription error:', err);
          setLoading(false);
        }
      );
      entry = { unsubscribe, refs: 0 };
      contextMap.set(pageId, entry);
    }
    entry.refs += 1;
    subscribedKeyRef.current = { contextKey, pageId };

    return () => {
      const subKey = subscribedKeyRef.current;
      if (!subKey) return;
      const cm = activeSubsByContext.get(subKey.contextKey);
      if (!cm) return;
      const e = cm.get(subKey.pageId);
      if (!e) return;
      e.refs -= 1;
      // Eviction is deferred to the next subscribe — keeping the listener
      // around for the LRU window costs only a handful of bytes and lets
      // back-navigation reuse the cached data.
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
