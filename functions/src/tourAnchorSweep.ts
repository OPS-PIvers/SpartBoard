// Monthly prune of rebound queue items and old batch docs (LIVE_TOURS_V2.md D23).
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import {
  DAY_MS,
  TOUR_ANCHOR_BATCHES,
  TOUR_ANCHOR_QUEUE,
} from './tourAnchorQueue';
import './functionsInit';

export const TOUR_ANCHOR_RETENTION_MS = 90 * DAY_MS;
const PAGE = 400;

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
  };
}

export async function runTourAnchorSweep(
  db: admin.firestore.Firestore,
  now: number = Date.now()
): Promise<{ rebound: number; batches: number }> {
  const q = sweepQueries(db, now);
  return {
    rebound: await deleteAll(db, q.rebound),
    batches: await deleteAll(db, q.batches),
  };
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
