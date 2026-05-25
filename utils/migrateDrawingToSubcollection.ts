import { doc, writeBatch, type Firestore } from 'firebase/firestore';
import type { DrawableObject, DrawingConfig, DrawingPage } from '@/types';

/**
 * Phase 2 PR 2.6 — relocate `DrawingConfig.pages[].objects[]` from the
 * dashboard document into the page-nested subcollection at
 *   /users/{uid}/dashboards/{dashboardId}/drawings/{widgetId}/pages/{pageId}
 *   /users/{uid}/dashboards/{dashboardId}/drawings/{widgetId}/pages/{pageId}/objects/{objectId}
 *
 * - One-way migration. Sets `subcollectionMigrated: true` on the config so
 *   subsequent loads skip the work. Idempotent: a second call with the flag
 *   already set is a no-op.
 * - Page-metadata (currently just `{ background }`) is written to the parent
 *   `/pages/{pageId}` doc; objects go to the inner `/objects` collection.
 * - The dashboard doc keeps `pages[]` as a *denormalized cache* — id +
 *   background only. `objects[]` is dropped post-migration so subsequent
 *   reads do not have to ship the full canvas down with every dashboard
 *   snapshot. This is the one-release backward-compat window the spec calls
 *   out; older clients can still read page id + background but will see
 *   empty `objects[]` until they pick up the subcollection hook.
 * - Writes are chunked into batches of {@link FIRESTORE_BATCH_OP_LIMIT} so
 *   widgets with >500 objects don't trip Firestore's per-batch hard cap.
 *   Page-metadata writes interleave with object writes in the same batch
 *   stream — they count against the same 500-op budget.
 * - Partial failure: if a batch commit throws, the function rethrows
 *   WITHOUT setting `subcollectionMigrated`. The next load will retry the
 *   migration from scratch. `setDoc` is idempotent (the same object id
 *   overwrites cleanly), so re-running cannot duplicate data.
 */

/** Firestore allows 500 ops per writeBatch; reserve a small margin so page
 *  metadata writes can interleave without pushing a batch over the limit. */
export const FIRESTORE_BATCH_OP_LIMIT = 450;

interface MigrateOptions {
  db: Firestore;
  uid: string;
  dashboardId: string;
  widgetId: string;
  config: DrawingConfig;
}

interface MigrateResult {
  /** The post-migration config (with `subcollectionMigrated: true` and
   *  `pages[].objects` stripped to keep the dashboard doc lean). */
  migratedConfig: DrawingConfig;
  /** True if Firestore writes were issued; false if the migration short-
   *  circuited because the flag was already set. */
  ran: boolean;
}

/**
 * Run the migration, persisting objects + page metadata to the subcollection
 * and returning the post-migration config the caller should write back to
 * the dashboard doc.
 */
export const migrateDrawingToSubcollection = async ({
  db,
  uid,
  dashboardId,
  widgetId,
  config,
}: MigrateOptions): Promise<MigrateResult> => {
  if (config.subcollectionMigrated) {
    return { migratedConfig: config, ran: false };
  }

  const pages: DrawingPage[] = Array.isArray(config.pages) ? config.pages : [];

  // Build the flat write queue. Each entry is a (ref, payload) pair so we
  // can chunk uniformly. Mixing page-doc writes with object writes in the
  // same queue keeps ordering deterministic (page meta before its objects).
  type WriteOp =
    | { kind: 'page'; pageId: string; payload: { background?: string } }
    | {
        kind: 'object';
        pageId: string;
        objectId: string;
        payload: DrawableObject;
      };
  const ops: WriteOp[] = [];

  for (const page of pages) {
    ops.push({
      kind: 'page',
      pageId: page.id,
      payload: { background: page.background ?? 'blank' },
    });
    for (const obj of page.objects ?? []) {
      ops.push({
        kind: 'object',
        pageId: page.id,
        objectId: obj.id,
        payload: obj,
      });
    }
  }

  for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_OP_LIMIT) {
    const batch = writeBatch(db);
    const slice = ops.slice(i, i + FIRESTORE_BATCH_OP_LIMIT);
    for (const op of slice) {
      if (op.kind === 'page') {
        const ref = doc(
          db,
          'users',
          uid,
          'dashboards',
          dashboardId,
          'drawings',
          widgetId,
          'pages',
          op.pageId
        );
        batch.set(ref, op.payload, { merge: true });
      } else {
        const ref = doc(
          db,
          'users',
          uid,
          'dashboards',
          dashboardId,
          'drawings',
          widgetId,
          'pages',
          op.pageId,
          'objects',
          op.objectId
        );
        batch.set(ref, op.payload);
      }
    }
    await batch.commit();
  }

  // Denormalized cache: keep pages[] (id + background) on the dashboard doc
  // so the page list is readable without an extra round trip, but drop the
  // `objects[]` arrays since the subcollection is now the source of truth.
  const denormalizedPages: DrawingPage[] = pages.map((p) => ({
    id: p.id,
    objects: [],
    background: p.background,
  }));

  return {
    migratedConfig: {
      ...config,
      pages: denormalizedPages,
      subcollectionMigrated: true,
    },
    ran: true,
  };
};

/**
 * Detect whether a config needs migration: it has `pages` and any page
 * carries non-empty `objects[]`, and the flag is unset.
 */
export const needsSubcollectionMigration = (
  config: DrawingConfig | undefined | null
): boolean => {
  if (!config || config.subcollectionMigrated) return false;
  const pages = Array.isArray(config.pages) ? config.pages : [];
  return pages.some((p) => Array.isArray(p?.objects) && p.objects.length > 0);
};
