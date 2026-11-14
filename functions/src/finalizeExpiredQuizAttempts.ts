// Turns in timed quiz attempts whose time limit has run out, so the limit holds even when the student's page doesn't.
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import { isPeriodFrozen, withQuizSessionContent } from './quizSessionContent';
import { buildQuizFinalizeUpdate, sessionQuestionIds } from './quizFinalize';
import { TIME_LIMIT_GRACE_MS, isOverTime } from './quizTurnIn';

type Firestore = admin.firestore.Firestore;
type Doc = Record<string, unknown>;

/** The shortest limit is a minute, so younger clocks can't have run out. */
const MIN_LIMIT_MS = 60_000;
const MAX_READ_PER_RUN = 5000;
const MAX_FINALIZE_PER_RUN = 400;
const PAGE = 500;

export interface FinalizeExpiredResult {
  candidates: number;
  finalized: number;
  failed: number;
}

/** A pause the teacher hasn't resumed yet stops the clock. */
function openPause(session: Doc): boolean {
  const spans = Array.isArray(session.pauseSpans) ? session.pauseSpans : [];
  const lastTo = spans.length
    ? Number((spans[spans.length - 1] as Doc)?.to)
    : 0;
  return typeof session.pausedAt === 'number' && session.pausedAt > lastTo;
}

/** Held at a Stop or reopened by the teacher: the idle sweep leaves these to the student too. */
function waitsForStudent(r: Doc): boolean {
  return (
    r.partHeld === true || (r.unlocked === true && r.unlockKind === 'reopen')
  );
}

async function candidates(
  db: Firestore,
  now: number
): Promise<admin.firestore.QueryDocumentSnapshot[]> {
  const cutoff = admin.firestore.Timestamp.fromMillis(
    now - MIN_LIMIT_MS - TIME_LIMIT_GRACE_MS
  );
  const out: admin.firestore.QueryDocumentSnapshot[] = [];
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  while (out.length < MAX_READ_PER_RUN) {
    let q = db
      .collectionGroup('responses')
      .where('status', 'in', ['joined', 'in-progress'])
      .where('attemptStartedAt', '<', cutoff)
      .orderBy('attemptStartedAt', 'asc')
      .limit(PAGE);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    out.push(
      ...page.docs.filter((d) => d.ref.path.startsWith('quiz_sessions/'))
    );
    if (page.size < PAGE) break;
    last = page.docs[page.docs.length - 1];
  }
  return out;
}

export async function runFinalizeExpiredQuizAttempts(
  db: Firestore,
  now: number = Date.now()
): Promise<FinalizeExpiredResult> {
  const docs = await candidates(db, now);
  const sessions = new Map<string, Doc | null>();
  let finalized = 0;
  let failed = 0;
  for (const snap of docs) {
    if (finalized + failed >= MAX_FINALIZE_PER_RUN) break;
    const sessionRef = snap.ref.parent.parent;
    if (!sessionRef) continue;
    if (!sessions.has(sessionRef.id)) {
      const s = await sessionRef.get();
      sessions.set(
        sessionRef.id,
        s.exists
          ? await withQuizSessionContent(sessionRef, s.data() ?? {})
          : null
      );
    }
    const session = sessions.get(sessionRef.id);
    if (!session || session.status === 'paused' || openPause(session)) continue;
    if (session.status === 'waiting') continue;
    const response = snap.data();
    if (waitsForStudent(response) || isPeriodFrozen(session, response, now))
      continue;
    if (!(await isOverTime(db, session, response, now))) continue;
    try {
      const done = await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(snap.ref)).data();
        if (!fresh || waitsForStudent(fresh)) return false;
        // A retake or reopen since the query restarted the clock.
        const startedAt = (
          fresh.attemptStartedAt as admin.firestore.Timestamp | undefined
        )?.toMillis?.();
        const queried = (
          response.attemptStartedAt as admin.firestore.Timestamp | undefined
        )?.toMillis?.();
        if (startedAt !== queried) return false;
        const update = buildQuizFinalizeUpdate(
          fresh,
          {
            questionIds: sessionQuestionIds(session.publicQuestions),
            completenessModel:
              typeof session.completenessModel === 'number'
                ? session.completenessModel
                : 0,
          },
          now
        );
        if (!update) return false;
        tx.update(snap.ref, { ...update, autoSubmitted: true, timeUp: true });
        return true;
      });
      if (done) finalized++;
    } catch (err) {
      failed++;
      logger.warn('[finalizeExpiredQuizAttempts] tx failed', {
        path: snap.ref.path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  logger.info('[finalizeExpiredQuizAttempts] run', {
    candidates: docs.length,
    finalized,
    failed,
  });
  return { candidates: docs.length, finalized, failed };
}

export const finalizeExpiredQuizAttempts = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
  },
  async () => {
    await runFinalizeExpiredQuizAttempts(admin.firestore());
  }
);
