/**
 * Hourly sweep that finalizes quiz responses that have been sitting in
 * `joined` or `in-progress` past the idle threshold. Addresses the
 * "student joins, answers a few, never submits — work is lost" failure
 * the user reported.
 *
 * What it does:
 *   - Queries `collectionGroup('responses')` for docs where status is
 *     joined or in-progress and `lastWriteAt` is older than the cutoff.
 *   - Promotes any draft answers to submitted, then flips the response
 *     to `status: 'completed'` with `autoSubmitted: true` so the teacher
 *     can distinguish auto-finalized rows from manually submitted ones
 *     in the results view.
 *   - Skips the cross-launch ledger increment intentionally — PIN-keyed
 *     anonymous students don't have a ledger entry (uids rotate), and
 *     SSO bookkeeping is non-trivial to do from server context without
 *     re-reading the parent session + assignment. Teachers can use the
 *     existing `unlockStudentAttempt` action if a refund is needed.
 *
 * Idempotency: once a doc flips to `completed` it falls out of the
 * status filter, so a re-run of the same window is a no-op.
 *
 * Pre-feature responses written before `lastWriteAt` existed are
 * skipped by the inequality query (Firestore semantics) — correct
 * behavior; we don't want to retroactively auto-submit historical
 * attempts.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

/**
 * Wall-clock minutes a response may sit idle in `joined`/`in-progress`
 * before being auto-finalized. 90 minutes covers a full class period
 * plus a tail; intentionally not per-assignment configurable in this
 * pass to keep the change small (revisit if teachers ask for it).
 */
const IDLE_THRESHOLD_MINUTES = 90;
const IDLE_THRESHOLD_MS = IDLE_THRESHOLD_MINUTES * 60 * 1000;

/**
 * Safety cap so a backlog (e.g. after a deploy or an outage) doesn't
 * monopolise a single run. Firestore batches max at 500 ops; we leave
 * headroom for the implicit ops the SDK adds.
 */
const MAX_FINALIZE_PER_RUN = 400;

interface QuizAnswer {
  questionId?: string;
  status?: string;
}

interface QuizResponseDoc {
  status?: string;
  lastWriteAt?: admin.firestore.Timestamp;
  completedAttempts?: number;
  answers?: QuizAnswer[];
}

export const finalizeIdleQuizAttempts = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
  },
  async () => {
    const db = admin.firestore();
    // lastWriteAt is a server-stamped Firestore Timestamp (see
    // `firestore.rules` for the request.time == lastWriteAt
    // enforcement). The cutoff must be a Timestamp too, otherwise
    // the inequality query against a Timestamp-typed field returns
    // zero rows (Firestore strict type comparison).
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - IDLE_THRESHOLD_MS
    );

    const stale = await db
      .collectionGroup('responses')
      .where('status', 'in', ['joined', 'in-progress'])
      .where('lastWriteAt', '<', cutoff)
      .limit(MAX_FINALIZE_PER_RUN)
      .get();

    if (stale.empty) {
      console.log('[finalizeIdleQuizAttempts] no stale responses');
      return;
    }

    const finalizedAt = Date.now();
    let batch = db.batch();
    let batchOps = 0;
    let finalized = 0;

    for (const docSnap of stale.docs) {
      // Defense in depth: collectionGroup('responses') matches any path
      // ending in /responses/{id}. We only want quiz responses; reject
      // anything not under `quiz_sessions/{sid}/responses/{id}`.
      if (!docSnap.ref.path.startsWith('quiz_sessions/')) continue;

      const data = (docSnap.data() ?? {}) as QuizResponseDoc;
      // Defensive: filter out any null/non-object answer entries so
      // a legacy/aborted-write doc doesn't propagate sparse entries
      // through the auto-finalized response (the teacher results
      // surface previously never saw these because the student
      // never clicked Submit; auto-finalization could force them
      // through and crash render code that assumes
      // `answer.questionId` exists).
      const answers = (Array.isArray(data.answers) ? data.answers : []).filter(
        (a): a is QuizAnswer => a !== null && typeof a === 'object'
      );
      // Promote any pending drafts to submitted so the teacher's
      // results view counts them as the student's final answers.
      const finalAnswers = answers.map((a) =>
        a.status === 'draft' ? { ...a, status: 'submitted' } : a
      );

      // Don't consume an attempt slot for a student who joined but
      // never wrote a single answer — they'd otherwise hit the cap
      // without seeing a question. The doc still flips to
      // `completed` with `autoSubmitted: true` so it falls out of
      // the live "joined" bucket; teachers can review and (if
      // needed) clear the row via removeStudent.
      const update: Record<string, unknown> = {
        status: 'completed',
        submittedAt: finalizedAt,
        autoSubmitted: true,
        answers: finalAnswers,
      };
      if (finalAnswers.length > 0) {
        update.completedAttempts = (data.completedAttempts ?? 0) + 1;
      }
      batch.update(docSnap.ref, update);
      batchOps++;
      finalized++;

      if (batchOps >= 400) {
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    }
    if (batchOps > 0) {
      await batch.commit();
    }

    console.log(
      `[finalizeIdleQuizAttempts] finalized ${finalized} stale responses (cutoff=${cutoff.toDate().toISOString()})`
    );
  }
);
