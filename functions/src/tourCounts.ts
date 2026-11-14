// Tour play counts (web tour list): plays and finishes from each run doc, public link views from the public endpoint.
import './functionsInit';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import { GL_TOURS_COLLECTION } from './glTours';

/** building_guided_learning_tours/{setId}/stats/counts: written only here, admins read. */
export const TOUR_COUNTS_PATH = (setId: string) =>
  `${GL_TOURS_COLLECTION}/${setId}/stats/counts`;

type RunLike = { startedAt?: unknown; done?: unknown } | undefined;

/** What one write to a teacher's run doc adds: a new startedAt is a play, the first done of that run is a finish. */
export function runCountDelta(
  before: RunLike,
  after: RunLike
): { plays: number; finished: number } {
  if (!after || !Number.isInteger(after.startedAt))
    return { plays: 0, finished: 0 };
  const sameRun = !!before && before.startedAt === after.startedAt;
  // A run started before the stored one is a stale or replayed write, not a new play.
  const older =
    !!before &&
    Number.isInteger(before.startedAt) &&
    (after.startedAt as number) < (before.startedAt as number);
  if (older) return { plays: 0, finished: 0 };
  return {
    plays: sameRun ? 0 : 1,
    finished:
      after.done === true && !(sameRun && before?.done === true) ? 1 : 0,
  };
}

const COUNT_WAIT_MS = 1500;

const inc = (n: number) => admin.firestore.FieldValue.increment(n);

export const tourRunCounter = onDocumentWritten(
  {
    document: `${GL_TOURS_COLLECTION}/{setId}/runs/{uid}`,
    memory: '256MiB',
    maxInstances: 10,
  },
  async (event) => {
    const delta = runCountDelta(
      event.data?.before.data(),
      event.data?.after.data()
    );
    if (!delta.plays && !delta.finished) return;
    await admin
      .firestore()
      .doc(TOUR_COUNTS_PATH(event.params.setId))
      .set(
        {
          ...(delta.plays ? { plays: inc(delta.plays) } : {}),
          ...(delta.finished ? { finished: inc(delta.finished) } : {}),
        },
        { merge: true }
      );
  }
);

/** Counts one view of a tour's public link page; never fails the request. */
export async function countPublicView(
  db: admin.firestore.Firestore,
  setId: string
): Promise<void> {
  try {
    const write = db
      .doc(TOUR_COUNTS_PATH(setId))
      .set({ linkViews: inc(1) }, { merge: true });
    write.catch(() => undefined);
    // A slow write never holds the public page back by more than this.
    await Promise.race([
      write,
      new Promise((resolve) => setTimeout(resolve, COUNT_WAIT_MS)),
    ]);
  } catch (err) {
    logger.warn('[tourCounts] link view not counted', { err: String(err) });
  }
}
