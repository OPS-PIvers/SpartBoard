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
  lastWriteAt?: number;
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
    const cutoff = Date.now() - IDLE_THRESHOLD_MS;

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
      const answers = Array.isArray(data.answers) ? data.answers : [];
      // Promote any pending drafts to submitted so the teacher's
      // results view counts them as the student's final answers.
      const finalAnswers = answers.map((a) =>
        a && a.status === 'draft' ? { ...a, status: 'submitted' } : a
      );

      batch.update(docSnap.ref, {
        status: 'completed',
        submittedAt: finalizedAt,
        completedAttempts: (data.completedAttempts ?? 0) + 1,
        autoSubmitted: true,
        answers: finalAnswers,
      });
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
      `[finalizeIdleQuizAttempts] finalized ${finalized} stale responses (cutoff=${new Date(cutoff).toISOString()})`
    );
  }
);
