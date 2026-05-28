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
      // Oldest-first so a sustained backlog doesn't starve the docs
      // that have been waiting longest. Without an explicit order
      // Firestore's default is by document key, which is effectively
      // random for the responses subcollection.
      .orderBy('lastWriteAt', 'asc')
      .limit(MAX_FINALIZE_PER_RUN)
      .get();

    if (stale.empty) {
      console.log('[finalizeIdleQuizAttempts] no stale responses');
      return;
    }

    // Batch-read parent quiz_session docs so we can skip docs whose
    // session isn't currently accepting work. Two skip categories:
    //
    //   - 'paused': teacher intentionally stopped (often end-of-day,
    //     intending to resume next class period). Without skipping,
    //     students get force-finalized with `autoSubmitted: true` 90
    //     min after pause, requiring per-student `unlockStudentAttempt`
    //     to recover the live attempt.
    //   - 'waiting': session created but teacher hasn't advanced to Q1
    //     yet (lobby state). Joined students sitting in the lobby
    //     shouldn't be auto-submitted with 0 answers just because the
    //     teacher got pulled into a meeting before starting. Also
    //     covers the `resumeAssignment` branch that resumes a
    //     never-started session back to 'waiting'.
    //
    // 'active' and 'ended' sessions proceed to the per-doc tx as
    // before. `resumeAssignment` (hooks/useQuizAssignments.ts) batch-
    // refreshes `lastWriteAt` on every joined/in-progress response when
    // it flips status paused → active, so a resumed session's stale
    // responses don't get instantly swept on the next tick.
    //
    // One Firestore read per unique sid, not per response — kept cheap
    // for the public-ed budget. The race-window between this batch
    // read and the per-doc tx below is bounded by the run duration
    // (~20s on a full sweep): a teacher who pauses inside that window
    // may still see some students finalized, but worst case they re-
    // pause next tick and the rest are caught.
    const parentSessionIds = new Set<string>();
    for (const docSnap of stale.docs) {
      if (!docSnap.ref.path.startsWith('quiz_sessions/')) continue;
      // Path shape: quiz_sessions/{sid}/responses/{rid}
      const segments = docSnap.ref.path.split('/');
      if (segments.length < 4 || segments[0] !== 'quiz_sessions') continue;
      parentSessionIds.add(segments[1]);
    }
    const sessionRefs = Array.from(parentSessionIds).map((sid) =>
      db.doc(`quiz_sessions/${sid}`)
    );
    // `getAll` issues one network round-trip for N docs; returns docs in
    // the same order as the input refs. Missing docs come back as
    // `exists === false` snapshots, which we treat as "session gone" —
    // a deleted parent session means orphan responses, which we skip
    // (don't sweep into a missing parent; if the teacher deleted the
    // whole session deliberately, the responses are already
    // inaccessible from the live monitor).
    //
    // Availability fallback: if `getAll` itself throws (network blip,
    // deadline exceeded), we proceed with an empty status map. That
    // disables the new skip categories for this tick — the per-doc
    // loop still runs and finalizes legitimate stale responses, which
    // is the pre-PR behavior. Better to degrade to the old correctness
    // than to abort the entire hourly sweep on a single transient
    // failure.
    const sessionStatusBySid = new Map<string, string | undefined>();
    let parentReadFailed = false;
    if (sessionRefs.length > 0) {
      try {
        const sessionDocs = await db.getAll(...sessionRefs);
        for (const sessionDoc of sessionDocs) {
          if (!sessionDoc.exists) continue;
          const status = (sessionDoc.data() ?? {}).status as string | undefined;
          sessionStatusBySid.set(sessionDoc.id, status);
        }
      } catch (err) {
        parentReadFailed = true;
        console.warn(
          '[finalizeIdleQuizAttempts] parent session batch read failed; proceeding without skip data',
          err
        );
      }
    }

    const finalizedAt = Date.now();
    let finalized = 0;
    let skippedRaced = 0;
    let skippedPaused = 0;
    let skippedWaiting = 0;
    let skippedOrphan = 0;
    let failed = 0;

    // Per-doc transactions instead of a single batch so a student who
    // submits between our query read and the write isn't overwritten —
    // each transaction re-reads the response and re-checks `status` +
    // `lastWriteAt` before promoting drafts. The batch alternative
    // would let one stale doc roll back finalizations for the entire
    // run, OR (without a precondition) silently clobber a fresh
    // submission with `autoSubmitted: true`. Per-doc txs trade some
    // throughput for correctness; at the per-hour cadence and the
    // 400-doc cap, the cost is bounded (~20s on a full sweep).
    for (const docSnap of stale.docs) {
      // Defense in depth: collectionGroup('responses') matches any path
      // ending in /responses/{id}. We only want quiz responses; reject
      // anything not under `quiz_sessions/{sid}/responses/{id}`.
      if (!docSnap.ref.path.startsWith('quiz_sessions/')) continue;

      const sid = docSnap.ref.path.split('/')[1];
      // Skip docs whose parent session is paused or waiting:
      //   - paused: teacher intentionally stopped. Force-finalizing
      //     now would erase the live attempt with `autoSubmitted:
      //     true`. `resumeAssignment` refreshes lastWriteAt on every
      //     joined/in-progress response so resumed sessions re-enter
      //     the sweep on a fresh clock, not stamped to before-pause.
      //   - waiting: session created but never started (teacher
      //     hasn't advanced to Q1, or resumed a never-started
      //     session). Joined-state lobby attendees would otherwise be
      //     auto-submitted with 0 answers after the idle threshold.
      //
      // If parent batch read failed (parentReadFailed flag), the map
      // is empty — `parentStatus` is undefined and `has(sid)` is
      // false, so EVERY doc would fall through to the orphan-skip
      // branch and nothing would get finalized. Bypass both skip
      // branches in that case and fall back to pre-PR behavior of
      // sweeping every doc.
      if (!parentReadFailed) {
        const parentStatus = sessionStatusBySid.get(sid);
        if (parentStatus === 'paused') {
          skippedPaused++;
          continue;
        }
        if (parentStatus === 'waiting') {
          skippedWaiting++;
          continue;
        }
        // Orphan response: parent session was deleted. Counted
        // separately so the operational metric reflects that these
        // aren't write failures — there's nothing to sweep into.
        if (!sessionStatusBySid.has(sid)) {
          skippedOrphan++;
          continue;
        }
      }

      try {
        const result = await db.runTransaction(async (tx) => {
          const freshSnap = await tx.get(docSnap.ref);
          if (!freshSnap.exists) return 'gone' as const;
          const fresh = (freshSnap.data() ?? {}) as QuizResponseDoc;
          // Re-check the snapshot-read predicates inside the tx. A
          // student submit (status → 'completed') or any subsequent
          // answer write (lastWriteAt advanced past cutoff) between
          // the query and the tx-read means this doc is no longer
          // eligible.
          if (fresh.status !== 'joined' && fresh.status !== 'in-progress') {
            return 'raced-status' as const;
          }
          if (
            fresh.lastWriteAt &&
            fresh.lastWriteAt.toMillis() >= cutoff.toMillis()
          ) {
            return 'raced-write' as const;
          }

          // Defensive: filter out any null/non-object answer entries so
          // a legacy/aborted-write doc doesn't propagate sparse entries
          // through the auto-finalized response.
          const answers = (
            Array.isArray(fresh.answers) ? fresh.answers : []
          ).filter((a): a is QuizAnswer => a !== null && typeof a === 'object');
          // Promote any pending drafts to submitted so the teacher's
          // results view counts them as the student's final answers.
          const finalAnswers = answers.map((a) =>
            a.status === 'draft' ? { ...a, status: 'submitted' } : a
          );

          // Don't consume an attempt slot for a student who joined
          // but never wrote a single answer — they'd otherwise hit
          // the cap without seeing a question. The doc still flips
          // to `completed` with `autoSubmitted: true` so it falls
          // out of the live "joined" bucket; teachers can review
          // and (if needed) clear the row via removeStudent.
          //
          // Also clear `unlocked`: if the cron finalizes a doc that
          // was previously teacher-unlocked but the student never
          // came back, leaving `unlocked: true` would trip the
          // `existing.status === 'completed' && existing.unlocked`
          // rejoin branch in useQuizSession (joinQuizSession resume-
          // unlocked path) and grant another attempt without
          // consuming a slot — silently bypassing the cap.
          const update: Record<string, unknown> = {
            status: 'completed',
            submittedAt: finalizedAt,
            autoSubmitted: true,
            answers: finalAnswers,
            unlocked: false,
          };
          if (finalAnswers.length > 0) {
            update.completedAttempts = (fresh.completedAttempts ?? 0) + 1;
          }
          tx.update(docSnap.ref, update);
          return 'finalized' as const;
        });
        if (result === 'finalized') {
          finalized++;
        } else if (result === 'raced-status' || result === 'raced-write') {
          skippedRaced++;
        }
      } catch (err) {
        failed++;
        console.warn(
          '[finalizeIdleQuizAttempts] tx failed',
          docSnap.ref.path,
          err
        );
      }
    }

    // Log field ordering: keep the original `finalized .. raced ..
    // failed .. cutoff` adjacency so any pre-existing log-based
    // metric / alert regex (`raced=(\d+), failed=(\d+)` etc.) keeps
    // matching. New skip counters are appended after the original
    // parenthetical.
    console.log(
      `[finalizeIdleQuizAttempts] finalized ${finalized} stale responses (raced=${skippedRaced}, failed=${failed}, cutoff=${cutoff.toDate().toISOString()}) [paused=${skippedPaused}, waiting=${skippedWaiting}, orphan=${skippedOrphan}${parentReadFailed ? ', parentReadFailed=true' : ''}]`
    );

    // If more than ~10% of *attempted writes* failed, escalate by
    // throwing so the scheduler logs an error-level event and retries
    // on the next tick. The denominator deliberately excludes skip
    // categories (raced / paused / waiting / orphan) — those aren't
    // write attempts and including them would hide a structural
    // problem: e.g. 380 raced + 20 failed (100% of attempted writes
    // failing) would not have tripped the prior `total = finalized
    // + raced + failed` denominator.
    //
    // Minimum-attempts floor of 10: at low N a single transient
    // contention failure (failed=1, finalized=0) would otherwise
    // throw and trigger a Cloud Scheduler retry storm during quiet
    // hours, e.g. a 3 AM tick where the only stale doc happens to
    // have a transient tx failure. The threshold only kicks in once
    // we have enough samples to distinguish structural problems
    // from noise.
    const attempted = finalized + failed;
    const ATTEMPTS_FLOOR = 10;
    if (attempted >= ATTEMPTS_FLOOR && failed * 10 > attempted) {
      throw new Error(
        `[finalizeIdleQuizAttempts] elevated failure rate: ${failed}/${attempted}`
      );
    }
  }
);
