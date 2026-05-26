import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

/**
 * Phase 2 PR 2.6 — best-effort cleanup of a DrawingWidget page's Firestore
 * subcollection when the page is deleted from the dashboard.
 *
 * Without this, `useDrawingPages.removePage` would only remove the page from
 * the denormalized `pages[]` cache on the dashboard doc, leaving the
 * page-meta doc and all of its child object docs orphaned at
 *   /users/{uid}/dashboards/{dashboardId}/drawings/{widgetId}/pages/{pageId}
 *   /users/{uid}/dashboards/{dashboardId}/drawings/{widgetId}/pages/{pageId}/objects/*
 *
 * Pseudo-atomicity: child object docs are batch-deleted FIRST in chunks of
 * 450 ops, then the parent page-meta doc is removed. If a chunk commit
 * fails midway, the parent still exists, so a re-run can resume — re-running
 * the same id-set is idempotent (deleting an already-deleted doc is a no-op
 * in Firestore).
 *
 * Errors are surfaced to the caller via the returned Promise; the
 * DrawingWidget reports them through its standard error-toast path.
 */

const FIRESTORE_BATCH_LIMIT = 450;

interface Options {
  db: Firestore;
  uid: string;
  dashboardId: string;
  widgetId: string;
  pageId: string;
}

export const deleteDrawingPageSubcollection = async ({
  db,
  uid,
  dashboardId,
  widgetId,
  pageId,
}: Options): Promise<void> => {
  const objectsCol = collection(
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

  const snapshot = await getDocs(objectsCol);
  const ids = snapshot.docs.map((d) => d.id);

  for (let i = 0; i < ids.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    const slice = ids.slice(i, i + FIRESTORE_BATCH_LIMIT);
    for (const id of slice) {
      batch.delete(
        doc(
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
        )
      );
    }
    await batch.commit();
  }

  // Parent page-meta doc last — its existence signals "children are present"
  // for any future reader that uses it as a marker.
  await deleteDoc(
    doc(
      db,
      'users',
      uid,
      'dashboards',
      dashboardId,
      'drawings',
      widgetId,
      'pages',
      pageId
    )
  );
};
