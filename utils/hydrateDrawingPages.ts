import { collection, getDocs, type Firestore } from 'firebase/firestore';
import type { DrawableObject, DrawingPage } from '@/types';

// Post-migration pages[].objects is stripped; read non-active pages from subcollection; live page uses in-memory objects to match what's on screen.

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
