// Server backstop for a closed Video Activity class (ASSIGNED_TAB D6): turns its open attempts in when no teacher tab stayed open to do it.
import { createHash } from 'node:crypto';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from './firebaseAdmin';

type Firestore = admin.firestore.Firestore;
type Doc = Record<string, unknown>;

export const SESSIONS = 'video_activity_sessions';
export const TURN_INS = 'video_class_turn_ins';

/** Mirrors END_TURN_IN_DELAY_MS (utils/quizFinalizeOpenResponses.ts): the write grace plus a margin. */
export const TURN_IN_DELAY_MS = 125_000;

/** A marker that keeps failing is dropped after this long. */
export const GIVE_UP_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const MAX_MARKERS_PER_RUN = 100;

interface Row {
  state?: unknown;
  closedAt?: unknown;
  label?: unknown;
}

function rowsOf(session: Doc | undefined): Record<string, Row> {
  const rows = session?.periodAccess;
  return rows && typeof rows === 'object' ? (rows as Record<string, Row>) : {};
}

export function markerId(sessionId: string, classKey: string): string {
  return createHash('sha256')
    .update(`${sessionId}\n${classKey}`)
    .digest('hex')
    .slice(0, 40);
}

/** Classes this write closed, keyed to their new closedAt; only the Assigned tab's Close stamps closedAt. */
export function newlyClosed(
  before: Doc | undefined,
  after: Doc | undefined
): Array<[string, number]> {
  const was = rowsOf(before);
  const out: Array<[string, number]> = [];
  for (const [key, row] of Object.entries(rowsOf(after))) {
    if (row?.state !== 'closed' || typeof row.closedAt !== 'number') continue;
    const prev = was[key];
    if (prev?.state === 'closed' && prev.closedAt === row.closedAt) continue;
    out.push([key, row.closedAt]);
  }
  return out;
}

/** Queues a turn-in for each class this session write closed. */
export async function queueClosedClasses(
  db: Firestore,
  sessionId: string,
  before: Doc | undefined,
  after: Doc | undefined
): Promise<number> {
  const closed = newlyClosed(before, after);
  await Promise.all(
    closed.map(([classKey, closedAt]) =>
      db
        .collection(TURN_INS)
        .doc(markerId(sessionId, classKey))
        .set({
          sessionId,
          classKey,
          closedAt,
          dueAt: closedAt + TURN_IN_DELAY_MS,
        })
    )
  );
  return closed.length;
}

/** Still closed by the same Close that queued this marker; a Reopen or a later Close makes it stale. */
function stillClosed(
  session: Doc | undefined,
  classKey: string,
  closedAt: number
): boolean {
  const row = rowsOf(session)[classKey];
  return row?.state === 'closed' && row.closedAt === closedAt;
}

function inClass(r: Doc, classKey: string, label: string): boolean {
  return typeof r.classId === 'string' && r.classId
    ? r.classId === classKey
    : r.classPeriod === label;
}

/** Let in, reopened for, unlocked or a blank join: left open, as the teacher-tab turn-in leaves them. */
function staysOpen(session: Doc, r: Doc, now: number): boolean {
  if (r.unlocked === true) return true;
  const uid = typeof r.studentUid === 'string' ? r.studentUid : '';
  const pass = (session.studentAccess as Doc | undefined)?.[uid];
  if (uid && typeof pass === 'number' && pass > now) return true;
  if (Array.isArray(session.reopenedFor) && session.reopenedFor.includes(uid))
    return true;
  return !Array.isArray(r.answers) || r.answers.length === 0;
}

export type TurnInOutcome = 'stale' | 'done';

/** Turns in one closed class's unfinished attempts, as videoClassTurnIn.ts does from the teacher's tab. */
export async function turnInClosedVideoClass(
  db: Firestore,
  sessionId: string,
  classKey: string,
  closedAt: number,
  now: number
): Promise<{ outcome: TurnInOutcome; turnedIn: number }> {
  const sessionRef = db.collection(SESSIONS).doc(sessionId);
  const session = (await sessionRef.get()).data();
  if (!session || !stillClosed(session, classKey, closedAt))
    return { outcome: 'stale', turnedIn: 0 };
  const rawLabel = rowsOf(session)[classKey]?.label;
  const label = typeof rawLabel === 'string' ? rawLabel : '';
  const open = await sessionRef
    .collection('responses')
    .where('completedAt', '==', null)
    .get();
  const picked = open.docs.filter((d) => {
    const r = d.data();
    return inClass(r, classKey, label) && !staysOpen(session, r, now);
  });
  // Turned in when the teacher's tab would have done it, so a late sweep doesn't make on-time work Late.
  const at = Math.min(now, closedAt + TURN_IN_DELAY_MS);
  const results = await Promise.allSettled(
    picked.map((d) =>
      db.runTransaction(async (tx) => {
        const parent = (await tx.get(sessionRef)).data();
        if (!parent || !stillClosed(parent, classKey, closedAt)) return false;
        const fresh = (await tx.get(d.ref)).data();
        if (!fresh || fresh.completedAt != null) return false;
        if (staysOpen(parent, fresh, now)) return false;
        const prior =
          typeof fresh.completedAttempts === 'number'
            ? fresh.completedAttempts
            : 0;
        tx.update(d.ref, {
          completedAt: at,
          completedAttempts: prior + 1,
          turnIn: { at, claimed: at },
        });
        return true;
      })
    )
  );
  const failed = results.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  );
  if (failed) throw failed.reason;
  const turnedIn = results.filter(
    (r) => r.status === 'fulfilled' && r.value
  ).length;
  return { outcome: 'done', turnedIn };
}

export interface VideoClassTurnInRunResult {
  markers: number;
  turnedIn: number;
  stale: number;
  failed: number;
  gaveUp: number;
}

/** Runs every queued turn-in whose grace has passed, then clears its marker. */
export async function runVideoClassTurnIns(
  db: Firestore,
  now: number = Date.now()
): Promise<VideoClassTurnInRunResult> {
  const due = await db
    .collection(TURN_INS)
    .where('dueAt', '<=', now)
    .orderBy('dueAt', 'asc')
    .limit(MAX_MARKERS_PER_RUN)
    .get();
  const result: VideoClassTurnInRunResult = {
    markers: due.size,
    turnedIn: 0,
    stale: 0,
    failed: 0,
    gaveUp: 0,
  };
  for (const marker of due.docs) {
    const m = marker.data();
    const { sessionId, classKey, closedAt } = m;
    // Only the marker as read is cleared; a newer Close rewrites it and keeps its own.
    const clear = () =>
      marker.ref.delete({ lastUpdateTime: marker.updateTime }).catch(() => {});
    if (
      typeof sessionId !== 'string' ||
      typeof classKey !== 'string' ||
      typeof closedAt !== 'number'
    ) {
      await clear();
      continue;
    }
    try {
      const r = await turnInClosedVideoClass(
        db,
        sessionId,
        classKey,
        closedAt,
        now
      );
      if (r.outcome === 'stale') result.stale++;
      result.turnedIn += r.turnedIn;
      await clear();
    } catch (err) {
      result.failed++;
      logger.warn('[videoClassTurnIns] turn-in failed', {
        sessionId,
        classKey,
        err: String(err),
      });
      if (now - closedAt > GIVE_UP_AFTER_MS) {
        result.gaveUp++;
        await clear();
      }
    }
  }
  logger.info('[videoClassTurnIns] run', result);
  return result;
}

export const queueVideoClassTurnIns = onDocumentUpdated(
  { document: `${SESSIONS}/{sessionId}`, region: 'us-central1', retry: true },
  async (event) => {
    await queueClosedClasses(
      admin.firestore(),
      event.params.sessionId,
      event.data?.before.data(),
      event.data?.after.data()
    );
  }
);

export const sweepVideoClassTurnIns = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeoutSeconds: 300,
    memory: '256MiB',
    region: 'us-central1',
  },
  async () => {
    await runVideoClassTurnIns(admin.firestore());
  }
);
