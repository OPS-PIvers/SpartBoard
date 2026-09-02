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
 *
 * PAGINATION (fixed alongside extracting the testable `runFinalizeIdleQuiz
 * Attempts` core, mirroring `expireActivityWallShares.ts` / `gcPlcOrphans.ts`):
 * the stale-response query is ordered oldest-`lastWriteAt`-first, and 'paused'
 * / recently-'waiting' / orphan-parent responses are permanently or
 * long-lived SKIPPED (no write, so their `lastWriteAt` never advances). A
 * `paused` session in particular can sit unresumed indefinitely (end of a
 * unit, end of the school year). Because skipped docs are always the oldest
 * and nothing ever removes them from the query, a single un-paginated
 * `.limit(N).get()` page fetched the SAME oldest N docs every run forever —
 * once the accumulated skip-only backlog exceeded N, any genuinely-idle
 * active response sorting after it was pushed out of every future run's
 * window and would NEVER be auto-finalized (the exact data-loss bug this
 * sweep exists to prevent, just deferred past the read window instead of
 * skipped outright). Fetching now PAGINATES (`startAfter` cursor on
 * `orderBy('lastWriteAt').orderBy(FieldPath.documentId())`) up to
 * `MAX_READ_PER_RUN` — a ceiling set far above any realistic per-run
 * accumulation, not a page size — so a run can walk past an arbitrarily large
 * skip-only prefix and still reach real candidates within the same tick.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
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
 * Hard cap on actual write transactions per run. Firestore batches max
 * at 500 ops; we leave headroom for the implicit ops the SDK adds.
 */
const MAX_FINALIZE_PER_RUN = 400;

/**
 * Overall safety ceiling on stale-response docs READ per run — a runaway
 * guard, NOT an expected limit (mirrors `MAX_PLCS_PER_RUN` / `MAX_
 * LAPSED_SHARES_PER_RUN` in the sibling sweeps). The fetch PAGINATES
 * (`RESPONSE_PAGE_SIZE` pages, `startAfter` cursor), so every stale doc up to
 * this ceiling is visited every run — not just the first page. Set well above
 * any realistic per-run accumulation of permanently-skipped (paused / recently
 * -waiting / orphan) responses so a genuinely-idle active response sorting
 * after that backlog still gets read (and finalized, budget permitting) in
 * the same run.
 */
export const MAX_READ_PER_RUN = 20000;

/** Page size for the paginated stale-response fetch (`startAfter` cursor). */
export const RESPONSE_PAGE_SIZE = 500;

/**
 * Max age a 'waiting' session is allowed to keep blocking the sweep.
 * 'waiting' sessions normally hold lobby joiners while the teacher
 * advances to Q1; this PR intentionally skips them so a teacher who
 * gets pulled into a meeting before starting doesn't return to find
 * every student auto-submitted. But there is no organic end-state for
 * an abandoned demo/practice session — without this bound the
 * skipped-waiting bucket grows monotonically across a school year.
 * 24h is comfortably past any plausible single-day "started but never
 * advanced" case; older waiting sessions are treated as abandoned and
 * their responses are finalized normally.
 */
const WAITING_ABANDONED_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Cloud-Functions-local mirror of `QuizResponseAnswer` in the app's root
 * `types.ts` (no shared import between the two type surfaces — keep them in
 * sync by hand). Only the fields this sweep reads or writes are declared.
 */
interface QuizAnswer {
  questionId?: string;
  answer?: string;
  answeredAt?: number;
  status?: string;
  /** Mirrors `UnrespondedReason`; absent means the student responded. */
  unresponded?: 'passed' | 'expired' | 'abandoned' | 'capture-unavailable';
}

interface QuizResponseDoc {
  status?: string;
  lastWriteAt?: admin.firestore.Timestamp;
  completedAttempts?: number;
  answers?: QuizAnswer[];
  /** M17 per-student subset of `publicQuestions`; absent means "all of them". */
  servedQuestionIds?: unknown;
}

/**
 * The questions this student was actually shown. M17 lets a session serve a
 * per-student subset, snapshotted on the response doc; marking every
 * `publicQuestion` abandoned would fabricate misses for questions the student
 * never had. A non-array value means no subset was recorded.
 */
export function resolveUnrespondedQuestionIds(
  sessionQuestionIds: readonly string[],
  servedQuestionIds: unknown
): string[] {
  if (!Array.isArray(servedQuestionIds)) return [...sessionQuestionIds];
  const served = new Set(
    servedQuestionIds.filter((id): id is string => typeof id === 'string')
  );
  return sessionQuestionIds.filter((id) => served.has(id));
}

interface QuizSessionDoc {
  status?: string;
  createdAt?: admin.firestore.Timestamp | number;
  /** Student-safe question list; only `id` is read here. */
  publicQuestions?: { id?: unknown }[];
  /** Opt-in marker; only sessions created by a client that understands `unresponded` carry it. */
  completenessModel?: number;
}

type Firestore = admin.firestore.Firestore;
type QueryDocSnap = admin.firestore.QueryDocumentSnapshot;

/**
 * Extract the parent session id from a response doc path. Returns null
 * for any path that doesn't match the expected `quiz_sessions/{sid}/
 * responses/{rid}` shape — a single source of truth so the gather loop
 * and the per-doc loop can't drift apart on what counts as a valid
 * response path.
 */
function parseQuizResponsePath(path: string): string | null {
  const segments = path.split('/');
  if (segments.length < 4) return null;
  if (segments[0] !== 'quiz_sessions') return null;
  if (segments[2] !== 'responses') return null;
  const sid = segments[1];
  if (!sid) return null;
  return sid;
}

/**
 * Paginates the stale-response `collectionGroup('responses')` query up to
 * `MAX_READ_PER_RUN`, `RESPONSE_PAGE_SIZE` docs at a time, via a `startAfter`
 * cursor on `orderBy('lastWriteAt').orderBy(FieldPath.documentId())` (the
 * doc-id tiebreaker keeps pagination correct when multiple responses share an
 * identical `lastWriteAt`). See the module header for why a single
 * un-paginated page silently starved genuinely-idle responses once a
 * skip-only backlog grew past one page.
 */
async function fetchStaleResponsesPaginated(
  db: Firestore,
  cutoff: admin.firestore.Timestamp
): Promise<QueryDocSnap[]> {
  const results: QueryDocSnap[] = [];
  let lastDoc: QueryDocSnap | undefined;
  while (results.length < MAX_READ_PER_RUN) {
    const pageLimit = Math.min(
      RESPONSE_PAGE_SIZE,
      MAX_READ_PER_RUN - results.length
    );
    let query = db
      .collectionGroup('responses')
      .where('status', 'in', ['joined', 'in-progress'])
      .where('lastWriteAt', '<', cutoff)
      .orderBy('lastWriteAt', 'asc')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageLimit);
    if (lastDoc) query = query.startAfter(lastDoc);
    const page = await query.get();
    if (page.empty) break;
    results.push(...page.docs);
    lastDoc = page.docs[page.docs.length - 1];
    if (page.size < pageLimit) break;
  }
  if (results.length >= MAX_READ_PER_RUN) {
    console.warn(
      `[finalizeIdleQuizAttempts] hit MAX_READ_PER_RUN ceiling (${MAX_READ_PER_RUN}) — raise it or shard the sweep`
    );
  }
  return results;
}

/**
 * Single-retry wrapper around `db.getAll`. The original PR landed a
 * "degrade to pre-PR behavior on failure" fallback that, in practice,
 * re-introduced the exact data-loss bug the PR was supposed to fix
 * (sweep paused-session responses and force-finalize their students).
 * A single retry catches transient deadline/network blips; if the
 * retry also throws, we re-throw so Cloud Scheduler retries the
 * entire run on the next tick — strictly safer than degrading.
 */
async function readSessionDocsWithRetry(
  db: Firestore,
  refs: admin.firestore.DocumentReference[]
): Promise<admin.firestore.DocumentSnapshot[]> {
  try {
    return await db.getAll(...refs);
  } catch (err) {
    logger.warn(
      '[finalizeIdleQuizAttempts] parent session batch read failed; retrying once',
      { err: String(err) }
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      return await db.getAll(...refs);
    } catch (err2) {
      logger.error(
        '[finalizeIdleQuizAttempts] parent session batch read failed twice; aborting run so Cloud Scheduler retries on the next tick',
        { err: String(err2) }
      );
      throw err2;
    }
  }
}

export interface FinalizeIdleQuizAttemptsResult {
  staleFound: number;
  finalized: number;
  skippedRaced: number;
  skippedPaused: number;
  skippedWaiting: number;
  skippedOrphan: number;
  failed: number;
  writeBudgetExhausted: boolean;
}

/**
 * Core sweep, extracted from the scheduler wrapper so it can be exercised
 * against a stub Firestore in tests (mirrors `runGcPlcOrphans` / `runExpire
 * ActivityWallShares`).
 */
export async function runFinalizeIdleQuizAttempts(
  db: Firestore,
  now: number = Date.now()
): Promise<FinalizeIdleQuizAttemptsResult> {
  // lastWriteAt is a server-stamped Firestore Timestamp (see
  // `firestore.rules` for the request.time == lastWriteAt
  // enforcement). The cutoff must be a Timestamp too, otherwise
  // the inequality query against a Timestamp-typed field returns
  // zero rows (Firestore strict type comparison).
  const cutoff = admin.firestore.Timestamp.fromMillis(now - IDLE_THRESHOLD_MS);

  const staleDocs = await fetchStaleResponsesPaginated(db, cutoff);

  if (staleDocs.length === 0) {
    console.log('[finalizeIdleQuizAttempts] no stale responses');
    return {
      staleFound: 0,
      finalized: 0,
      skippedRaced: 0,
      skippedPaused: 0,
      skippedWaiting: 0,
      skippedOrphan: 0,
      failed: 0,
      writeBudgetExhausted: false,
    };
  }

  // Batch-read parent quiz_session docs so we can skip docs whose
  // session isn't currently accepting work. Three skip categories:
  //
  //   - 'paused': teacher intentionally stopped (often end-of-day,
  //     intending to resume next class period). Without skipping,
  //     students get force-finalized with `autoSubmitted: true` 90
  //     min after pause, requiring per-student `unlockStudentAttempt`
  //     to recover the live attempt.
  //   - 'waiting' (recent): session created but teacher hasn't
  //     advanced to Q1 yet (lobby state). Joined students sitting in
  //     the lobby shouldn't be auto-submitted with 0 answers just
  //     because the teacher got pulled into a meeting before
  //     starting. Bounded by WAITING_ABANDONED_AGE_MS — older waiting
  //     sessions are treated as abandoned and swept normally.
  //   - 'orphan' (parent deleted or malformed): we don't sweep into
  //     a missing parent; nothing reads the orphan response in the
  //     live monitor anyway.
  //
  // 'active' and 'ended' sessions proceed to the per-doc tx as
  // before. `resumeAssignment` (hooks/useQuizAssignments.ts) batch-
  // refreshes `lastWriteAt` on every joined/in-progress response
  // BEFORE flipping status off 'paused', so the cron never sees
  // stale-lastWriteAt + active at the same time for a legitimate
  // resume.
  //
  // One Firestore read per unique sid, not per response — kept cheap
  // for the public-ed budget. The race-window between this batch
  // read and the per-doc tx below is bounded by the run duration
  // (~20s on a full sweep): a teacher who pauses inside that window
  // may still see some students finalized, but worst case they re-
  // pause next tick and the rest are caught.
  const parentSessionIds = new Set<string>();
  for (const docSnap of staleDocs) {
    const sid = parseQuizResponsePath(docSnap.ref.path);
    if (sid) parentSessionIds.add(sid);
  }
  const sessionRefs = Array.from(parentSessionIds).map((sid) =>
    db.doc(`quiz_sessions/${sid}`)
  );
  // `getAll` issues one network round-trip for N docs. Missing docs
  // come back as `exists === false` snapshots, which we treat as
  // "session gone" — a deleted parent session means orphan responses,
  // which we skip (don't sweep into a missing parent; if the teacher
  // deleted the whole session deliberately, the responses are
  // already inaccessible from the live monitor).
  //
  // Availability fallback: if `getAll` throws (network blip, deadline
  // exceeded), retry once after a short backoff before falling
  // through. If the retry also throws we ABORT the run instead of
  // sweeping every doc as in the original PR — Cloud Scheduler will
  // retry the entire run on the next tick, which is safer than the
  // documented "degrade to pre-PR behavior" path: pre-PR behavior
  // *is* the data-loss bug this function fixes, so degrading to it on
  // a transient is exactly the regression we want to avoid for paused
  // sessions whose teachers expect to resume next class period.
  //
  // We cache session metadata (status + createdAt) so the per-doc
  // loop can apply the 'waiting' abandoned-age threshold without a
  // second read.
  interface CachedSession {
    status: string | undefined;
    createdAtMs: number | null;
    /** Question ids from the already-fetched doc; no extra read. */
    questionIds: string[];
    /** 0 for legacy sessions; >= 1 opts into the unresponded completeness model. */
    completenessModel: number;
  }
  const sessionMetaBySid = new Map<string, CachedSession>();
  if (sessionRefs.length > 0) {
    const sessionDocs = await readSessionDocsWithRetry(db, sessionRefs);
    for (const sessionDoc of sessionDocs) {
      if (!sessionDoc.exists) continue;
      const data = (sessionDoc.data() ?? {}) as QuizSessionDoc;
      const status = typeof data.status === 'string' ? data.status : undefined;
      let createdAtMs: number | null = null;
      if (
        data.createdAt &&
        typeof (data.createdAt as { toMillis?: () => number }).toMillis ===
          'function'
      ) {
        createdAtMs = (data.createdAt as admin.firestore.Timestamp).toMillis();
      } else if (typeof data.createdAt === 'number') {
        createdAtMs = data.createdAt;
      }
      const questionIds = Array.isArray(data.publicQuestions)
        ? data.publicQuestions
            .map((q) => (q && typeof q.id === 'string' ? q.id : null))
            .filter((id): id is string => !!id)
        : [];
      const completenessModel =
        typeof data.completenessModel === 'number' ? data.completenessModel : 0;
      sessionMetaBySid.set(sessionDoc.id, {
        status,
        createdAtMs,
        questionIds,
        completenessModel,
      });
    }
  }

  const finalizedAt = now;
  const waitingAbandonedCutoffMs = finalizedAt - WAITING_ABANDONED_AGE_MS;
  let finalized = 0;
  let skippedRaced = 0;
  let skippedPaused = 0;
  let skippedWaiting = 0;
  let skippedOrphan = 0;
  let failed = 0;
  let writeBudgetExhausted = false;

  // Per-doc transactions instead of a single batch so a student who
  // submits between our query read and the write isn't overwritten —
  // each transaction re-reads the response and re-checks `status` +
  // `lastWriteAt` before promoting drafts. The batch alternative
  // would let one stale doc roll back finalizations for the entire
  // run, OR (without a precondition) silently clobber a fresh
  // submission with `autoSubmitted: true`. Per-doc txs trade some
  // throughput for correctness; at the per-hour cadence and the
  // 400-doc cap, the cost is bounded (~20s on a full sweep).
  for (const docSnap of staleDocs) {
    // Stop processing once we've used the write budget — additional
    // docs read into `staleDocs` past this point are deferred to
    // the next tick.
    if (finalized + failed >= MAX_FINALIZE_PER_RUN) {
      writeBudgetExhausted = true;
      break;
    }
    // Defense in depth via the shared parser — anything not under
    // `quiz_sessions/{sid}/responses/{id}` is rejected here in the
    // same shape as the gather loop above.
    const sid = parseQuizResponsePath(docSnap.ref.path);
    if (!sid) continue;

    // Skip docs whose parent session is paused or recently 'waiting':
    //   - paused: teacher intentionally stopped. Force-finalizing
    //     now would erase the live attempt with `autoSubmitted:
    //     true`. `resumeAssignment` refreshes lastWriteAt on every
    //     joined/in-progress response BEFORE flipping status off
    //     'paused', so the cron never sees stale-lastWriteAt +
    //     not-paused at the same time for a legitimate resume.
    //   - waiting (recent): session created but never started.
    //     Joined-state lobby attendees would otherwise be auto-
    //     submitted with 0 answers after the idle threshold.
    //   - waiting (older than WAITING_ABANDONED_AGE_MS): treated as
    //     abandoned and swept normally, so practice/demo sessions
    //     can't accumulate as never-finalized lobby ghosts.
    //
    // A parent session present in the map but with `status ===
    // undefined` (legacy doc missing the field, or a partially-
    // written doc) is treated as orphan rather than allowed to fall
    // through — falling through would let a malformed parent take
    // the auto-finalize path, which is the least-safe default.
    const meta = sessionMetaBySid.get(sid);
    if (!meta) {
      skippedOrphan++;
      continue;
    }
    if (meta.status === 'paused') {
      skippedPaused++;
      continue;
    }
    if (meta.status === 'waiting') {
      const sessionAgeMs = meta.createdAtMs ?? finalizedAt; // missing createdAt → treat as new
      if (sessionAgeMs > waitingAbandonedCutoffMs) {
        skippedWaiting++;
        continue;
      }
      // Old waiting session → fall through and finalize normally.
    } else if (typeof meta.status !== 'string') {
      // Malformed / legacy parent — treat as orphan.
      skippedOrphan++;
      continue;
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

        // Absence of an entry must mean "never reached," so every question
        // the student left behind gets an explicit `abandoned` marker
        // (RR-08 sub-decision 1/5). There is no per-question requiredness
        // field yet, so EVERY missing question the student was SERVED is
        // marked (M17 subsets intersect); brief 3.5 should narrow this to
        // required slots once that field exists. The session doc was already
        // batch-read above — no extra Firestore read.
        //
        // DEPLOY GATE: this branch runs only for sessions the NEW teacher
        // client created (`completenessModel: 1`). Every push to dev-paul
        // deploys functions/ to the shared production project, where the old
        // client's teacher UI, exports and scoring have no concept of
        // `unresponded` and would render these entries as answered-but-blank.
        // Legacy sessions therefore take exactly the pre-PR path below.
        const missingEntries: QuizAnswer[] = [];
        if (meta.completenessModel >= 1) {
          const answeredIds = new Set(
            finalAnswers
              .map((a) => a.questionId)
              .filter((id): id is string => typeof id === 'string')
          );
          const servedIds = resolveUnrespondedQuestionIds(
            meta.questionIds,
            fresh.servedQuestionIds
          );
          for (const qid of servedIds) {
            if (answeredIds.has(qid)) continue;
            missingEntries.push({
              questionId: qid,
              answer: '',
              answeredAt: finalizedAt,
              status: 'submitted',
              unresponded: 'abandoned',
            });
          }
        }

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
          answers:
            missingEntries.length > 0
              ? [...finalAnswers, ...missingEntries]
              : finalAnswers,
          unlocked: false,
        };
        // Deliberately `finalAnswers`, not the synthetic markers: a student
        // who never answered anything must not consume an attempt slot.
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
    `[finalizeIdleQuizAttempts] finalized ${finalized} stale responses (raced=${skippedRaced}, failed=${failed}, cutoff=${cutoff.toDate().toISOString()}) [paused=${skippedPaused}, waiting=${skippedWaiting}, orphan=${skippedOrphan}, writeBudgetExhausted=${writeBudgetExhausted}]`
  );

  // Escalate on two distinct failure modes that the per-run
  // failure-rate gate alone misses:
  //
  //   1. Sustained low-N total failure (e.g. 3 AM tick, 9 stale
  //      docs, all 9 fail). The previous gate `attempted >= 10`
  //      stayed silent forever; we now treat any 100% failure rate
  //      as escalation-worthy regardless of count, with a small
  //      grace floor for `failed === 1` so a single transient tx
  //      blip can't page on its own.
  //   2. Above-threshold rate at higher volume. Per-tick gate of
  //      10% over a floor of 10 attempts; the comment defends
  //      excluding skip categories from the denominator.
  //
  // logger.error gives Cloud Logging severity=ERROR so the default
  // ERROR-severity alerts trip; we still throw so Cloud Scheduler
  // also logs the failure and retries on the next tick.
  const attempted = finalized + failed;
  const ATTEMPTS_FLOOR = 10;
  const isTotalFailure = failed >= 2 && finalized === 0;
  const isElevatedRate = attempted >= ATTEMPTS_FLOOR && failed * 10 > attempted;
  if (isTotalFailure || isElevatedRate) {
    const msg = `[finalizeIdleQuizAttempts] elevated failure rate: ${failed}/${attempted}`;
    logger.error(msg, {
      finalized,
      failed,
      skippedRaced,
      skippedPaused,
      skippedWaiting,
      skippedOrphan,
      writeBudgetExhausted,
    });
    throw new Error(msg);
  }

  return {
    staleFound: staleDocs.length,
    finalized,
    skippedRaced,
    skippedPaused,
    skippedWaiting,
    skippedOrphan,
    failed,
    writeBudgetExhausted,
  };
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
    await runFinalizeIdleQuizAttempts(db);
  }
);
