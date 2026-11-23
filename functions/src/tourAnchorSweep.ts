// Monthly prune of rebound queue items and old batch docs (LIVE_TOURS_V2.md D23).
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import {
  DAY_MS,
  TOUR_ANCHOR_BATCHES,
  TOUR_ANCHOR_QUEUE,
} from './tourAnchorQueue';
import './functionsInit';

export const TOUR_ANCHOR_RETENTION_MS = 90 * DAY_MS;
const PAGE = 400;
const STEPLESS_CAP = 2000;

type Query = admin.firestore.Query;

async function deleteAll(db: admin.firestore.Firestore, query: Query) {
  let deleted = 0;
  for (;;) {
    const snap = await query.limit(PAGE).get();
    if (snap.empty) return deleted;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < PAGE) return deleted;
  }
}

/** Single-field range queries, so no composite index is needed. */
export function sweepQueries(db: admin.firestore.Firestore, now: number) {
  const cutoff = admin.firestore.Timestamp.fromMillis(
    now - TOUR_ANCHOR_RETENTION_MS
  );
  return {
    // Only rebound items carry reboundAt.
    rebound: db.collection(TOUR_ANCHOR_QUEUE).where('reboundAt', '<', cutoff),
    batches: db.collection(TOUR_ANCHOR_BATCHES).where('createdAt', '<', cutoff),
    requested: db
      .collection(TOUR_ANCHOR_QUEUE)
      .where('requestedAt', '<', cutoff),
  };
}

export async function runTourAnchorSweep(
  db: admin.firestore.Firestore,
  now: number = Date.now()
): Promise<{ rebound: number; batches: number; requested: number }> {
  const q = sweepQueries(db, now);
  return {
    rebound: await deleteAll(db, q.rebound),
    batches: await deleteAll(db, q.batches),
    requested: await deleteStepless(db, q.requested),
  };
}

/** Old request_tour_anchors items no saved step ever used; one a step uses drops out of the window for its rebind. */
async function deleteStepless(db: admin.firestore.Firestore, query: Query) {
  const snap = await query.limit(STEPLESS_CAP).get();
  const used = (d: admin.firestore.QueryDocumentSnapshot) => {
    const o: unknown = d.get('occurrences');
    return Array.isArray(o) && o.length > 0;
  };
  const del = admin.firestore.FieldValue.delete();
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += PAGE) {
    const batch = db.batch();
    for (const d of snap.docs.slice(i, i + PAGE)) {
      if (used(d)) batch.update(d.ref, { requestedAt: del });
      else {
        batch.delete(d.ref);
        deleted++;
      }
    }
    await batch.commit();
  }
  return deleted;
}

export const tourAnchorSweep = onSchedule(
  {
    // 1st of the month, 04:10 America/Chicago.
    schedule: '10 4 1 * *',
    timeZone: 'America/Chicago',
    memory: '256MiB',
    maxInstances: 1,
    timeoutSeconds: 300,
  },
  async () => {
    const result = await runTourAnchorSweep(admin.firestore());
    logger.info('[tourAnchorSweep] done', result);
  }
);
