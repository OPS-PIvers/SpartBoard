/**
 * Hourly straggler sweep for Activity Wall media archival.
 *
 * The Firestore triggers in `activityWallArchive.ts` run on the critical path,
 * but a transient Drive failure, a cold instance, or a teacher who had not yet
 * connected Drive leaves a submission parked at `firebase`/`failed`. Storage is
 * only a transit buffer, so this retries anything older than
 * `STUCK_SUBMISSION_AGE_MS` and then deletes transit objects nothing owns any
 * more. Modeled on `sweepStuckQuizArchives.ts`.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {
  ACTIVITY_WALL_ARCHIVE_SECRETS,
  ACTIVITY_WALL_MEDIA_ROOT,
  LEGACY_ACTIVITY_WALL_MEDIA_ROOT,
  ORPHAN_OBJECT_AGE_MS,
  SESSIONS_COLLECTION,
  SUBMISSIONS_COLLECTION,
  archiveActivityWallMediaCore,
  buildDefaultWallArchiveDeps,
} from './activityWallArchive';
import './functionsInit';

type Firestore = admin.firestore.Firestore;

/** Retry window: a submission untouched for this long is a straggler. */
export const STUCK_SUBMISSION_AGE_MS = 10 * 60 * 1000;
/** Runaway guard, not an expected volume. */
export const MAX_SUBMISSIONS_PER_RUN = 500;
export const SUBMISSION_PAGE_SIZE = 100;
/** One page of bucket listing per prefix per run, per the brief. */
export const STORAGE_PAGE_SIZE = 500;

export interface StuckSubmission {
  sessionId: string;
  submissionId: string;
}

export interface StorageObject {
  name: string;
  /** Milliseconds since epoch; 0 when Storage reported no timestamp. */
  createdAt: number;
}

export interface WallSweepDeps {
  archiveOne: (input: StuckSubmission) => Promise<void>;
  listObjects: (prefix: string) => Promise<StorageObject[]>;
  deleteObject: (name: string) => Promise<void>;
  now: () => number;
}

export interface WallSweepSummary {
  scanned: number;
  retried: number;
  recovered: number;
  stillStuck: number;
  objectsScanned: number;
  objectsDeleted: number;
  markedLost: number;
  cleanupRetried: number;
  cleanupCleared: number;
  phaseErrors: string[];
}

/** Untouched for longer than the retry window, measured from the last attempt. */
export function isStuckSubmission(
  data: Record<string, unknown> | undefined,
  now: number
): boolean {
  const started =
    typeof data?.archiveStartedAt === 'number' ? data.archiveStartedAt : 0;
  const attempted =
    typeof data?.lastAttemptAt === 'number' ? data.lastAttemptAt : 0;
  const submitted =
    typeof data?.submittedAt === 'number' ? data.submittedAt : 0;
  const lastTouched = Math.max(started, attempted, submitted);
  if (lastTouched === 0) return false;
  return now - lastTouched >= STUCK_SUBMISSION_AGE_MS;
}

/** `{root}/{sessionId}/{submissionId}/{file}`, or the legacy two-segment form. */
export function parseMediaObjectName(
  name: string
): { sessionId: string; submissionId: string } | null {
  const parts = name.split('/');
  if (parts[0] === ACTIVITY_WALL_MEDIA_ROOT && parts.length >= 4) {
    return { sessionId: parts[1] ?? '', submissionId: parts[2] ?? '' };
  }
  if (parts[0] === LEGACY_ACTIVITY_WALL_MEDIA_ROOT && parts.length === 3) {
    const leaf = parts[2] ?? '';
    const dot = leaf.indexOf('.');
    return {
      sessionId: parts[1] ?? '',
      submissionId: dot > 0 ? leaf.slice(0, dot) : leaf,
    };
  }
  return null;
}

/**
 * Only bytes nothing owns any more are released: the submission is gone, gave
 * up at the terminal 'lost', or no longer points at this object because the
 * archive already succeeded and the transit delete leaked.
 */
export function isOrphanedObject(
  submission: Record<string, unknown> | null,
  objectName: string,
  createdAt: number,
  now: number
): boolean {
  if (createdAt === 0 || now - createdAt < ORPHAN_OBJECT_AGE_MS) return false;
  if (!submission) return true;
  if (submission.archiveStatus === 'lost') return true;
  return submission.storagePath !== objectName;
}

async function retryStragglers(
  db: Firestore,
  deps: WallSweepDeps,
  summary: WallSweepSummary,
  now: number
): Promise<void> {
  let cursor: admin.firestore.QueryDocumentSnapshot | null = null;
  while (summary.scanned < MAX_SUBMISSIONS_PER_RUN) {
    // Only these two literal values are queried: the new client always
    // writes `archiveStatus` explicitly (unlike a legacy submission, which
    // can imply 'firebase' from `storagePath` alone via
    // `effectiveArchiveStatus` without the field being set), so a Firestore
    // equality filter on the field catches every straggler this sweep owns.
    let query = db
      .collectionGroup(SUBMISSIONS_COLLECTION)
      .where('archiveStatus', 'in', ['firebase', 'failed'])
      .orderBy('submittedAt')
      .limit(SUBMISSION_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    cursor = page.docs[page.docs.length - 1] ?? null;

    for (const docSnap of page.docs) {
      const sessionRef = docSnap.ref.parent.parent;
      // The collection group also matches unrelated `submissions` subtrees.
      if (!sessionRef || sessionRef.parent.id !== SESSIONS_COLLECTION) continue;
      summary.scanned++;
      const data = (docSnap.data() ?? {}) as Record<string, unknown>;
      if (typeof data.storagePath !== 'string' || !data.storagePath) continue;
      // New-client submissions only; the legacy callable owns the rest (see
      // shouldArchiveSubmission in activityWallArchive.ts).
      if (!data.storagePath.startsWith(`${ACTIVITY_WALL_MEDIA_ROOT}/`)) {
        continue;
      }
      if (!isStuckSubmission(data, now)) continue;
      summary.retried++;
      try {
        await deps.archiveOne({
          sessionId: sessionRef.id,
          submissionId: docSnap.id,
        });
        summary.recovered++;
      } catch {
        summary.stillStuck++;
      }
    }

    if (page.size < SUBMISSION_PAGE_SIZE) break;
  }
}

/**
 * `storageCleanupPending` is set when an archive succeeded but the transit
 * delete failed; nothing else in the codebase reads the flag, so this is the
 * only retry path for those leftover objects.
 */
async function retryStorageCleanup(
  db: Firestore,
  deps: WallSweepDeps,
  summary: WallSweepSummary
): Promise<void> {
  const page = await db
    .collectionGroup(SUBMISSIONS_COLLECTION)
    .where('storageCleanupPending', '==', true)
    .limit(SUBMISSION_PAGE_SIZE)
    .get();
  for (const docSnap of page.docs) {
    const sessionRef = docSnap.ref.parent.parent;
    // The collection group also matches unrelated `submissions` subtrees.
    if (!sessionRef || sessionRef.parent.id !== SESSIONS_COLLECTION) continue;
    summary.cleanupRetried++;
    try {
      const objects = await deps.listObjects(
        `${ACTIVITY_WALL_MEDIA_ROOT}/${sessionRef.id}/${docSnap.id}/`
      );
      for (const object of objects) {
        await deps.deleteObject(object.name);
      }
      await docSnap.ref.set(
        { storageCleanupPending: admin.firestore.FieldValue.delete() },
        { merge: true }
      );
      summary.cleanupCleared++;
    } catch {
      continue;
    }
  }
}

async function sweepOrphanedObjects(
  db: Firestore,
  deps: WallSweepDeps,
  summary: WallSweepSummary,
  now: number
): Promise<void> {
  for (const root of [
    ACTIVITY_WALL_MEDIA_ROOT,
    LEGACY_ACTIVITY_WALL_MEDIA_ROOT,
  ]) {
    const objects = await deps.listObjects(`${root}/`);
    for (const object of objects) {
      summary.objectsScanned++;
      const parsed = parseMediaObjectName(object.name);
      if (!parsed?.sessionId || !parsed.submissionId) continue;
      const ref = db
        .collection(SESSIONS_COLLECTION)
        .doc(parsed.sessionId)
        .collection(SUBMISSIONS_COLLECTION)
        .doc(parsed.submissionId);
      const snap = await ref.get();
      const data = snap.exists
        ? ((snap.data() ?? {}) as Record<string, unknown>)
        : null;
      if (!isOrphanedObject(data, object.name, object.createdAt, now)) continue;
      try {
        await deps.deleteObject(object.name);
        summary.objectsDeleted++;
      } catch {
        continue;
      }
      // A submission still claiming this path has nothing left to archive.
      if (data && data.storagePath === object.name) {
        await ref
          .set(
            {
              archiveStatus: 'lost',
              archiveError: 'transit object expired',
              storagePath: admin.firestore.FieldValue.delete(),
            },
            { merge: true }
          )
          .catch(() => undefined);
        summary.markedLost++;
      }
    }
  }
}

export async function runSweepActivityWallArchives(
  db: Firestore,
  deps: WallSweepDeps
): Promise<WallSweepSummary> {
  const now = deps.now();
  const summary: WallSweepSummary = {
    scanned: 0,
    retried: 0,
    recovered: 0,
    stillStuck: 0,
    objectsScanned: 0,
    objectsDeleted: 0,
    markedLost: 0,
    cleanupRetried: 0,
    cleanupCleared: 0,
    phaseErrors: [],
  };
  try {
    await retryStragglers(db, deps, summary, now);
  } catch (err) {
    summary.phaseErrors.push(`retryStragglers: ${String(err)}`);
  }
  try {
    await retryStorageCleanup(db, deps, summary);
  } catch (err) {
    summary.phaseErrors.push(`retryStorageCleanup: ${String(err)}`);
  }
  try {
    await sweepOrphanedObjects(db, deps, summary, now);
  } catch (err) {
    summary.phaseErrors.push(`sweepOrphanedObjects: ${String(err)}`);
  }
  return summary;
}

export const sweepActivityWallArchives = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'America/Chicago',
    memory: '1GiB',
    timeoutSeconds: 540,
    secrets: ACTIVITY_WALL_ARCHIVE_SECRETS,
  },
  async () => {
    const db = admin.firestore();
    const archiveDeps = buildDefaultWallArchiveDeps();
    const bucket = admin.storage().bucket();
    const summary = await runSweepActivityWallArchives(db, {
      archiveOne: async (input) => {
        await archiveActivityWallMediaCore(archiveDeps, input);
      },
      listObjects: async (prefix) => {
        const [files] = await bucket.getFiles({
          prefix,
          autoPaginate: false,
          maxResults: STORAGE_PAGE_SIZE,
        });
        return files.map((file) => {
          const parsed = Date.parse(String(file.metadata?.timeCreated ?? ''));
          return {
            name: file.name,
            createdAt: Number.isFinite(parsed) ? parsed : 0,
          };
        });
      },
      deleteObject: async (name) => {
        await bucket.file(name).delete({ ignoreNotFound: true });
      },
      now: () => Date.now(),
    });
    console.log('[sweepActivityWallArchives]', JSON.stringify(summary));
  }
);
