// Published live-tour snapshots (docs/plans/shipped/GUIDED_LEARNING_STUDIO.md P7-3) and their one-time seed.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
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
  'webGoal',
  'webTourChecked',
  'webSuggestions',
  'webFixDismissed',
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

const sortKeys = (_key: string, value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0
        )
      )
    : value;

/** Mirrors fingerprint() in components/tours/tourSnapshot.ts: what a tour run shows, stable under key order. */
export function glTourFingerprint(
  setId: string,
  data: Record<string, unknown>
): string {
  const urls = data.imageUrls;
  const paths = data.imagePaths;
  const imageUrls =
    Array.isArray(urls) && urls.length > 0
      ? urls
      : data.imageUrl
        ? [data.imageUrl]
        : [];
  const imagePaths =
    Array.isArray(paths) && paths.length > 0
      ? paths
      : data.imagePath
        ? [data.imagePath]
        : undefined;
  const last = Math.max(imageUrls.length - 1, 0);
  const rawSteps = Array.isArray(data.steps)
    ? (data.steps as Record<string, unknown>[])
    : [];
  const steps = rawSteps.map((step) => {
    const idx = typeof step.imageIndex === 'number' ? step.imageIndex : 0;
    const web = step.web as Record<string, unknown> | undefined;
    const publicWeb = { ...web };
    delete publicWeb.note;
    delete publicWeb.claudeQuestion;
    return {
      ...step,
      imageIndex: Math.min(Math.max(idx, 0), imageUrls.length > 0 ? last : 0),
      xPct: step.xPct ?? 50,
      yPct: step.yPct ?? 50,
      showOverlay: step.showOverlay ?? 'none',
      ...(web ? { web: publicWeb } : {}),
    };
  });
  const content = buildGlTourContent(setId, {
    ...data,
    imageUrls,
    imagePaths,
    steps,
  });
  return JSON.stringify(JSON.parse(JSON.stringify(content)), sortKeys);
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
        const code = (err as { code?: number }).code;
        // Already published (6) or permanently unpublishable (3, such as over 1 MiB) must not block the marker.
        if (code === 6) {
          skipped++;
        } else if (code === 3) {
          skipped++;
          logger.error('[glTours] seed publish skipped for good', {
            id: doc.id,
            err,
          });
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
    // A deleted set takes its published tour with it, never a web tour that shares the id.
    if (event.data && !event.data.after.exists) {
      const ref = db.collection(GL_TOURS_COLLECTION).doc(setId);
      const snap = await ref.get();
      if (
        (snap.data() as { surface?: unknown } | undefined)?.surface !== 'web'
      ) {
        await ref.delete();
      }
    }
    await ensureGlToursSeeded(db);
  }
);
