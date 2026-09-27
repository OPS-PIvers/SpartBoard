// Published live-tour snapshots (docs/plans/shipped/GUIDED_LEARNING_STUDIO.md P7-3) and their one-time seed.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import {
  buildGlBuildingIndexEntry,
  GL_BUILDING_COLLECTION,
} from './glBuildingIndex';
import './functionsInit';

export const GL_TOURS_COLLECTION = 'building_guided_learning_tours';
export const GL_TOURS_META_ID = '_meta';
export const GL_TOURS_LOCK_ID = '_lock';
const CONTROL_IDS = new Set([GL_TOURS_META_ID, GL_TOURS_LOCK_ID]);
export const GL_TOURS_LOCK_STALE_MS = 10 * 60 * 1000;
const SEED_PAGE = 50;

// Must match NOT_PUBLISHED in components/tours/tourSnapshot.ts.
const NOT_PUBLISHED = new Set([
  'imagePaths',
  'imagePath',
  'imageUrl',
  'driveFileIds',
  'authorUid',
  'helpCenter',
  'isBuilding',
  'folderId',
  'order',
  'description',
  'createdAt',
  'updatedAt',
  'hasLiveTour',
]);

/** The published copy of a stored building set: everything a tour run shows. */
export function buildGlTourContent(
  setId: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!NOT_PUBLISHED.has(key) && value !== undefined) out[key] = value;
  }
  out.id = setId;
  return out;
}

// Claims the one-time seed; a lock older than 10 minutes is treated as abandoned.
export async function claimGlToursSeed(
  db: admin.firestore.Firestore,
  now: number = Date.now()
): Promise<boolean> {
  const tours = db.collection(GL_TOURS_COLLECTION);
  const metaRef = tours.doc(GL_TOURS_META_ID);
  const lockRef = tours.doc(GL_TOURS_LOCK_ID);
  return db.runTransaction(async (tx) => {
    const [meta, lock] = await Promise.all([tx.get(metaRef), tx.get(lockRef)]);
    if (meta.exists) return false;
    const startedAt: unknown = lock.exists ? lock.get('startedAt') : undefined;
    if (
      typeof startedAt === 'number' &&
      now - startedAt < GL_TOURS_LOCK_STALE_MS
    ) {
      return false;
    }
    tx.set(lockRef, { startedAt: now });
    return true;
  });
}

/** Publishes every set with a live tour that has no snapshot yet, then writes the marker unless a publish failed. */
export async function seedGlTours(
  db: admin.firestore.Firestore,
  now: number = Date.now()
): Promise<{ published: number; skipped: number; failed: number }> {
  const tours = db.collection(GL_TOURS_COLLECTION);
  let published = 0;
  let skipped = 0;
  let failed = 0;
  let cursor: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection(GL_BUILDING_COLLECTION)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(SEED_PAGE);
    if (cursor) q = q.startAfter(cursor);
    const page = await q.get();
    for (const doc of page.docs) {
      if (CONTROL_IDS.has(doc.id)) continue;
      const data = doc.data();
      if (!buildGlBuildingIndexEntry(doc.id, data)?.hasLiveTour) continue;
      try {
        // create(): never replace a snapshot an admin published meanwhile.
        await tours.doc(doc.id).create({
          set: buildGlTourContent(doc.id, data),
          publishedAt: now,
          publishedBy: 'auto',
        });
        published++;
      } catch (err) {
        if ((err as { code?: number }).code === 6) {
          skipped++;
        } else {
          failed++;
          logger.warn('[glTours] seed publish failed', { id: doc.id, err });
        }
      }
    }
    if (page.docs.length < SEED_PAGE) break;
    cursor = page.docs[page.docs.length - 1];
  }
  const batch = db.batch();
  // A failed publish leaves the marker unwritten so a later set write retries.
  if (failed === 0) batch.set(tours.doc(GL_TOURS_META_ID), { seededAt: now });
  batch.delete(tours.doc(GL_TOURS_LOCK_ID));
  await batch.commit();
  return { published, skipped, failed };
}

// Runs the seed once per project, the first time any set is written without a _meta marker.
export async function ensureGlToursSeeded(
  db: admin.firestore.Firestore
): Promise<boolean> {
  const meta = await db
    .collection(GL_TOURS_COLLECTION)
    .doc(GL_TOURS_META_ID)
    .get();
  if (meta.exists) return false;
  if (!(await claimGlToursSeed(db))) return false;
  const result = await seedGlTours(db);
  logger.info('[glTours] one-time publish of existing tours', result);
  return true;
}

export const glTourSnapshots = onDocumentWritten(
  {
    document: `${GL_BUILDING_COLLECTION}/{setId}`,
    memory: '512MiB',
    timeoutSeconds: 540,
    maxInstances: 10,
  },
  async (event) => {
    const { setId } = event.params;
    if (CONTROL_IDS.has(setId)) return;
    const db = admin.firestore();
    // A deleted set takes its published tour with it.
    if (event.data && !event.data.after.exists) {
      await db.collection(GL_TOURS_COLLECTION).doc(setId).delete();
    }
    await ensureGlToursSeeded(db);
  }
);
