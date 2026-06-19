/**
 * `aggregatePlcAssessment` — PII-safe anonymized analytics rollup (PRD §5,
 * §6.0, §3.6, §3.3).
 *
 * Trigger: `onWrite` of `plcs/{plcId}/contributions/{cid}`. Each teacher's
 * raw graded responses land as a `PlcContribution` whose embedded
 * `responses[]` carry student display names — that is the PII. Members must
 * NOT read those raw docs (rules tighten contribution reads to owner-only in
 * a later wave); instead they read the small, anonymized
 * `/plcs/{plcId}/aggregates/{assessmentId}` doc this function maintains.
 *
 * Recompute strategy — idempotent full recompute, NOT incremental:
 *   On any contribution write we re-read the WHOLE `contributions`
 *   subcollection and recompute the aggregate from scratch. This is the
 *   debounce/batch mechanism the PRD asks for: concurrent writes each trigger
 *   a fresh recompute over the current state, so they converge to the same
 *   result regardless of ordering or how many fire. There is no read-modify-
 *   write race on the aggregate doc because the computation depends only on
 *   the subcollection snapshot, never on the previous aggregate.
 *
 * Canonical id resolution (kills heuristic title-matching — Decision 4.0c):
 *   For the changed contribution we resolve which aggregate doc it rolls up
 *   to. If a `PlcCommonAssessment` in `plcs/{plcId}/assessments` designates a
 *   `syncGroupId` matching the contribution's `syncGroupId`, we key the
 *   aggregate on THAT assessment's id (the team-designated canonical id).
 *   Otherwise we fall back to the contribution's own quiz identity
 *   (`syncGroupId ?? quizId`). The aggregate then pools every contribution
 *   that resolves to the same id.
 *
 * Anonymization (FERPA boundary — Decisions 3.3, 6.0):
 *   The output contains ONLY counts and averages. NEVER a `studentDisplayName`,
 *   NEVER a per-student row. `perTeacher` rows carry teacher identity (that is
 *   intentional — teachers see each other) plus their own student COUNT, never
 *   their students' names.
 *
 * Cost posture (§8): `memory` + `maxInstances` pinned so a burst of result
 * publishes can't fan the function out unboundedly; one full-subcollection
 * read per write is the cost ceiling.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';

// Initialize the Admin SDK exactly once (guarded). `index.ts` and the other
// leaf modules do the same; whichever loads first wins, the rest no-op.
if (!admin.apps.length) {
  admin.initializeApp();
}

/** Aggregate schema version — bump when the output shape changes. */
export const AGGREGATE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Local copies of the contribution/aggregate shapes.
//
// The `functions/tsconfig.json` `rootDir` is `src`, so we cannot import the
// canonical types from the repo-root `types.ts`. These mirror
// `PlcContribution` / `PlcAssessmentAggregate` — keep field names in lockstep
// with `types.ts`. Inputs are parsed tolerantly (legacy / malformed docs must
// not crash the trigger).
// ---------------------------------------------------------------------------

/** Question identity snapshot embedded on each contribution. */
export interface ContributionQuestion {
  id: string;
  text: string;
  points: number;
}

/** One student's response within a contribution. Carries PII (`studentDisplayName`). */
export interface ContributionResponse {
  studentDisplayName: string;
  classPeriod: string;
  status: 'completed' | 'in-progress';
  scorePercent: number | null;
  pointsByQuestionId: Record<string, number>;
}

/** One teacher's contribution to a PLC's cross-teacher results. */
export interface Contribution {
  quizId: string;
  syncGroupId: string | null;
  teacherUid: string;
  teacherName: string;
  questionsSnapshot: ContributionQuestion[];
  responses: ContributionResponse[];
}

/** A team-designated common assessment (only the fields this CF needs). */
export interface CommonAssessmentLink {
  id: string;
  syncGroupId: string;
  /** Soft-delete tombstone — deleted assessments don't claim contributions. */
  deletedAt?: number | null;
}

export interface AggregatePerQuestion {
  questionId: string;
  text: string;
  correctPercent: number;
  points: number;
}

export interface AggregatePerTeacher {
  teacherUid: string;
  teacherName: string;
  classCount: number;
  averagePercent: number;
  studentCount: number;
}

/**
 * The anonymized aggregate payload (sans `ranAt`, which the trigger stamps via
 * `serverTimestamp()`). `assessmentId` is the resolved canonical id.
 */
export interface AggregatePayload {
  assessmentId: string;
  schemaVersion: number;
  teacherCount: number;
  studentCount: number;
  teamAveragePercent: number;
  perQuestion: AggregatePerQuestion[];
  perTeacher: AggregatePerTeacher[];
}

// ---------------------------------------------------------------------------
// Tolerant parsers
// ---------------------------------------------------------------------------

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseQuestion(raw: unknown): ContributionQuestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  if (id.length === 0) return null;
  return {
    id,
    text: asString(r.text),
    points: asFiniteNumber(r.points) ?? 0,
  };
}

function parseResponse(raw: unknown): ContributionResponse | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const status = r.status === 'completed' ? 'completed' : 'in-progress';
  const pointsByQuestionId: Record<string, number> = {};
  const rawPoints = r.pointsByQuestionId;
  if (typeof rawPoints === 'object' && rawPoints !== null) {
    for (const [qid, val] of Object.entries(
      rawPoints as Record<string, unknown>
    )) {
      const n = asFiniteNumber(val);
      if (n !== null) pointsByQuestionId[qid] = n;
    }
  }
  return {
    studentDisplayName: asString(r.studentDisplayName),
    classPeriod: asString(r.classPeriod),
    status,
    scorePercent: asFiniteNumber(r.scorePercent),
    pointsByQuestionId,
  };
}

/**
 * Parse a raw contribution doc into a `Contribution`, or `null` if it lacks
 * the identity fields needed to roll up (a malformed/empty doc). Withdrawn
 * contributions (no completed responses) parse fine and simply contribute
 * nothing — they are filtered by the aggregate math, not here.
 */
export function parseContribution(raw: unknown): Contribution | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const teacherUid = asString(r.teacherUid);
  if (teacherUid.length === 0) return null;
  const quizId = asString(r.quizId);
  const syncGroupRaw = r.syncGroupId;
  const syncGroupId =
    typeof syncGroupRaw === 'string' && syncGroupRaw.length > 0
      ? syncGroupRaw
      : null;
  // A contribution needs *some* quiz identity to resolve an aggregate id.
  if (quizId.length === 0 && syncGroupId === null) return null;

  const questionsSnapshot = Array.isArray(r.questionsSnapshot)
    ? r.questionsSnapshot
        .map(parseQuestion)
        .filter((q): q is ContributionQuestion => q !== null)
    : [];
  const responses = Array.isArray(r.responses)
    ? r.responses
        .map(parseResponse)
        .filter((x): x is ContributionResponse => x !== null)
    : [];

  return {
    quizId,
    syncGroupId,
    teacherUid,
    teacherName: asString(r.teacherName),
    questionsSnapshot,
    responses,
  };
}

function parseCommonAssessment(
  id: string,
  raw: unknown
): CommonAssessmentLink | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const syncGroupId = asString(r.syncGroupId);
  if (syncGroupId.length === 0) return null;
  const deletedAtRaw = r.deletedAt;
  const deletedAt =
    typeof deletedAtRaw === 'number' && Number.isFinite(deletedAtRaw)
      ? deletedAtRaw
      : null;
  return { id, syncGroupId, deletedAt };
}

// ---------------------------------------------------------------------------
// Canonical id resolution (Decision 4.0c)
// ---------------------------------------------------------------------------

/**
 * The quiz-identity fallback id for a contribution when no designated
 * assessment claims it: `syncGroupId ?? quizId`. Synced quizzes pool by their
 * shared group id; legacy unsynced quizzes pool by the contributing teacher's
 * local quizId (so a single teacher's unsynced quiz still gets an aggregate).
 */
export function fallbackAggregateId(contribution: Contribution): string {
  return contribution.syncGroupId ?? contribution.quizId;
}

/**
 * Resolve the canonical aggregate id for a contribution. A non-deleted
 * `PlcCommonAssessment` whose `syncGroupId` matches the contribution's
 * `syncGroupId` wins — that team-designated id is the canonical rollup target
 * (this is what kills heuristic title-matching). Otherwise fall back to the
 * contribution's own quiz identity.
 *
 * If two assessments designate the same `syncGroupId` (shouldn't happen, but
 * the data model can't forbid it), the lexicographically-smallest id wins so
 * the choice is deterministic across invocations (idempotency).
 */
export function resolveAggregateId(
  contribution: Contribution,
  assessments: CommonAssessmentLink[]
): string {
  if (contribution.syncGroupId !== null) {
    const matches = assessments
      .filter(
        (a) => a.deletedAt == null && a.syncGroupId === contribution.syncGroupId
      )
      .map((a) => a.id)
      .sort();
    if (matches.length > 0) return matches[0];
  }
  return fallbackAggregateId(contribution);
}

/**
 * Given the resolved aggregate id, select the contributions that pool into it.
 * A contribution belongs if EITHER (a) a designated assessment with that id
 * matches its `syncGroupId`, OR (b) its own fallback id equals the aggregate
 * id. Mirrors `resolveAggregateId` so the membership test is symmetric.
 */
export function contributionsForAggregate(
  aggregateId: string,
  contributions: Contribution[],
  assessments: CommonAssessmentLink[]
): Contribution[] {
  return contributions.filter(
    (c) => resolveAggregateId(c, assessments) === aggregateId
  );
}

// ---------------------------------------------------------------------------
// Aggregate computation (pure, anonymized)
// ---------------------------------------------------------------------------

function roundPercent(n: number): number {
  return Math.round(n);
}

/**
 * Compute the anonymized `AggregatePayload` for one assessment from its pooled
 * contributions. Pure + deterministic → idempotent (same input always yields
 * byte-identical output, modulo the `ranAt` the caller stamps).
 *
 * Math semantics mirror the client-side `aggregateGroup`
 * (`components/common/library/plcAnalyticsAggregate.ts`) so the server rollup
 * matches what teachers saw client-side before the PII tightening:
 *   - Only `status === 'completed'` responses count.
 *   - `teamAveragePercent` = mean of completed responses' `scorePercent`.
 *   - `perQuestion.correctPercent` = correct / answered across all completed
 *     responses (a question is "answered" if `pointsByQuestionId[qid]` is
 *     present; "correct" if that value is > 0).
 *   - `perTeacher`: classCount = distinct `classPeriod` among that teacher's
 *     completed responses; studentCount = that teacher's completed responses;
 *     averagePercent = mean of their completed `scorePercent`.
 *
 * Question identity is unioned across ALL contributions (keyed by question id)
 * so an assessment whose teammates' synced quizzes drifted by a question still
 * reports every question; text/points come from the first contribution that
 * declares the id. `perQuestion` is sorted by question id and `perTeacher` by
 * teacherUid for a stable, deterministic ordering.
 */
export function computeAggregate(
  assessmentId: string,
  contributions: Contribution[]
): AggregatePayload {
  // Union question identity across all contributions (first-seen wins for
  // text/points), preserving a stable membership set.
  const questionMeta = new Map<
    string,
    { text: string; points: number; answered: number; correct: number }
  >();
  for (const c of contributions) {
    for (const q of c.questionsSnapshot) {
      if (!questionMeta.has(q.id)) {
        questionMeta.set(q.id, {
          text: q.text,
          points: q.points,
          answered: 0,
          correct: 0,
        });
      }
    }
  }

  const teacherUids = new Set<string>();
  let totalStudents = 0;
  let teamScoreSum = 0;
  let teamScoreCount = 0;

  // Per-teacher accumulators.
  const perTeacherMap = new Map<
    string,
    {
      teacherName: string;
      classPeriods: Set<string>;
      studentCount: number;
      scoreSum: number;
      scoreCount: number;
    }
  >();

  for (const c of contributions) {
    let teacher = perTeacherMap.get(c.teacherUid);
    for (const r of c.responses) {
      if (r.status !== 'completed') continue;

      // Lazily create the teacher accumulator only when they have at least
      // one completed response — a teacher who auto-published an all-in-
      // progress doc contributes nothing and must not inflate teacherCount.
      if (!teacher) {
        teacher = {
          teacherName: c.teacherName,
          classPeriods: new Set<string>(),
          studentCount: 0,
          scoreSum: 0,
          scoreCount: 0,
        };
        perTeacherMap.set(c.teacherUid, teacher);
      }
      teacherUids.add(c.teacherUid);
      totalStudents++;
      teacher.studentCount++;
      if (r.classPeriod.length > 0) teacher.classPeriods.add(r.classPeriod);

      const score = r.scorePercent;
      if (score !== null) {
        teamScoreSum += score;
        teamScoreCount++;
        teacher.scoreSum += score;
        teacher.scoreCount++;
      }

      for (const [qid, pts] of Object.entries(r.pointsByQuestionId)) {
        const meta = questionMeta.get(qid);
        if (!meta) continue; // response references a question not in any snapshot
        meta.answered++;
        if (pts > 0) meta.correct++;
      }
    }
  }

  const perQuestion: AggregatePerQuestion[] = Array.from(questionMeta.entries())
    .map(([questionId, meta]) => ({
      questionId,
      text: meta.text,
      correctPercent:
        meta.answered > 0
          ? roundPercent((meta.correct / meta.answered) * 100)
          : 0,
      points: meta.points,
    }))
    .sort((a, b) =>
      a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0
    );

  const perTeacher: AggregatePerTeacher[] = Array.from(perTeacherMap.entries())
    .map(([teacherUid, t]) => ({
      teacherUid,
      teacherName: t.teacherName,
      classCount: t.classPeriods.size,
      averagePercent:
        t.scoreCount > 0 ? roundPercent(t.scoreSum / t.scoreCount) : 0,
      studentCount: t.studentCount,
    }))
    .sort((a, b) =>
      a.teacherUid < b.teacherUid ? -1 : a.teacherUid > b.teacherUid ? 1 : 0
    );

  return {
    assessmentId,
    schemaVersion: AGGREGATE_SCHEMA_VERSION,
    teacherCount: teacherUids.size,
    studentCount: totalStudents,
    teamAveragePercent:
      teamScoreCount > 0 ? roundPercent(teamScoreSum / teamScoreCount) : 0,
    perQuestion,
    perTeacher,
  };
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

/**
 * Read every contribution in a PLC's `contributions` subcollection plus its
 * designated common assessments, then recompute and write the aggregate doc
 * for `aggregateId`. Exposed for completeness; the trigger calls it.
 *
 * Uses `serverTimestamp()` for `ranAt` (the only non-deterministic field) and
 * `set()` (full overwrite) so the recompute is authoritative — a contribution
 * deletion that empties the pool resets the aggregate to zeros rather than
 * leaving stale numbers.
 */
export async function recomputePlcAggregate(
  db: admin.firestore.Firestore,
  plcId: string,
  aggregateId: string,
  contributions: Contribution[],
  assessments: CommonAssessmentLink[]
): Promise<void> {
  const pooled = contributionsForAggregate(
    aggregateId,
    contributions,
    assessments
  );
  const payload = computeAggregate(aggregateId, pooled);
  await db
    .collection('plcs')
    .doc(plcId)
    .collection('aggregates')
    .doc(aggregateId)
    .set({
      ...payload,
      ranAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

export const aggregatePlcAssessment = onDocumentWritten(
  {
    document: 'plcs/{plcId}/contributions/{cid}',
    // Cost posture (§8): a single small recompute per write; cap concurrency
    // so a burst of result publishes can't fan the function out unboundedly.
    memory: '256MiB',
    maxInstances: 5,
  },
  async (event) => {
    const { plcId } = event.params;
    const change = event.data;
    if (!change) {
      logger.warn('aggregatePlcAssessment: received event without data', {
        plcId,
      });
      return;
    }

    // The changed contribution determines WHICH aggregate(s) to recompute.
    // We look at both before + after so a delete (after absent) or a
    // syncGroupId change (before/after differ) recomputes the old and new
    // aggregate ids. Parse tolerantly — a malformed doc shouldn't crash the
    // trigger (and would be filtered from the rollup anyway).
    const before = change.before.exists
      ? parseContribution(change.before.data())
      : null;
    const after = change.after.exists
      ? parseContribution(change.after.data())
      : null;

    const db = admin.firestore();
    const plcRef = db.collection('plcs').doc(plcId);

    let contributions: Contribution[];
    let assessments: CommonAssessmentLink[];
    try {
      // Full-subcollection re-read = the debounce/converge mechanism: every
      // concurrent write recomputes over the same current state.
      const [contribSnap, assessSnap] = await Promise.all([
        plcRef.collection('contributions').get(),
        plcRef.collection('assessments').get(),
      ]);
      contributions = contribSnap.docs
        .map((d) => parseContribution(d.data()))
        .filter((c): c is Contribution => c !== null);
      assessments = assessSnap.docs
        .map((d) => parseCommonAssessment(d.id, d.data()))
        .filter((a): a is CommonAssessmentLink => a !== null);
    } catch (err) {
      // Bail without throwing — a thrown trigger is retried by Firestore, and
      // a retry storm on a transient read failure would amplify the problem.
      logger.error(
        'aggregatePlcAssessment: failed to read PLC subcollections',
        {
          plcId,
          error: err instanceof Error ? err.message : String(err),
        }
      );
      return;
    }

    // Resolve every aggregate id touched by this change (old + new).
    const aggregateIds = new Set<string>();
    if (before) aggregateIds.add(resolveAggregateId(before, assessments));
    if (after) aggregateIds.add(resolveAggregateId(after, assessments));
    if (aggregateIds.size === 0) {
      logger.info('aggregatePlcAssessment: no resolvable aggregate id', {
        plcId,
      });
      return;
    }

    for (const aggregateId of aggregateIds) {
      try {
        await recomputePlcAggregate(
          db,
          plcId,
          aggregateId,
          contributions,
          assessments
        );
        logger.info('aggregatePlcAssessment: recomputed aggregate', {
          plcId,
          aggregateId,
        });
      } catch (err) {
        // Log + continue to the next id; never throw (avoid retry storms).
        logger.error('aggregatePlcAssessment: aggregate write failed', {
          plcId,
          aggregateId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
);
