import { collection, getDocs, type Firestore } from 'firebase/firestore';
import type { DrawableObject, DrawingPage } from '@/types';

/**
 * Rehydrate `DrawingPage.objects[]` from the page-nested Firestore
 * subcollection written by {@link migrateDrawingToSubcollection}.
 *
 * Why this exists: post-migration the dashboard document keeps `pages[]` only
 * as a denormalized cache of `{ id, background }` — `objects[]` is emptied on
 * purpose so a dashboard snapshot doesn't ship the whole canvas. The live
 * widget reads objects through `useDrawingObjectsDoc`, but that hook is
 * page-scoped: it only subscribes to the page currently on screen. Any
 * consumer that needs the objects for pages OTHER than the active one (the
 * all-pages PNG export and the PDF export) has to go to Firestore for them,
 * or it silently renders background-only pages.
 *
 * The active page is served from the caller's live `objects[]` rather than a
 * fresh read: that array is the same state the canvas is painting, so the
 * export matches what the teacher sees on screen even if a just-drawn stroke
 * has not round-tripped through the Firestore listener yet. It also saves a
 * redundant read on the common single-page export.
 *
 * Reads run in parallel — a page count in the low tens is the realistic
 * ceiling for a classroom whiteboard, and the export is a user-initiated
 * one-shot, so latency matters more than read smoothing.
 */

interface HydrateOptions {
  db: Firestore;
  uid: string;
  dashboardId: string;
  widgetId: string;
  /** Denormalized page cache off the dashboard doc (id + background). */
  pages: readonly DrawingPage[];
  /** Page the widget currently has a live subscription for, if any. */
  livePageId?: string | null;
  /** Live objects for `livePageId`, used verbatim instead of re-reading. */
  liveObjects?: readonly DrawableObject[];
}

export const hydrateDrawingPagesFromSubcollection = async ({
  db,
  uid,
  dashboardId,
  widgetId,
  pages,
  livePageId,
  liveObjects,
}: HydrateOptions): Promise<DrawingPage[]> =>
  Promise.all(
    pages.map(async (page) => {
      if (livePageId && page.id === livePageId && liveObjects) {
        return { ...page, objects: [...liveObjects] };
      }
      const snapshot = await getDocs(
        collection(
          db,
          'users',
          uid,
          'dashboards',
          dashboardId,
          'drawings',
          widgetId,
          'pages',
          page.id,
          'objects'
        )
      );
      const objects = snapshot.docs.map((d) => d.data() as DrawableObject);
      // Ascending z — matches the live renderer's last-drawn-on-top order and
      // the ordering `useDrawingObjectsDoc` hands its consumers.
      objects.sort((a, b) => a.z - b.z);
      return { ...page, objects };
    })
  );
