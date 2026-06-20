/**
 * Pure filter + aggregation helpers for the Shared Data view.
 *
 * No React, no Firebase — all functions are side-effect free so they can
 * be heavily unit-tested without mocking.
 */

import type {
  PlcAssessmentAggregate,
  PlcAssignmentIndexEntry,
  PlcCommonAssessment,
  PlcContribution,
} from '@/types';

// ---------------------------------------------------------------------------
// Filter shapes
// ---------------------------------------------------------------------------

export interface SharedDataFilters {
  /** 'all' means no type filter applied. */
  type: 'all' | 'quiz' | 'video-activity';
  /** UID string, or 'all' for no teacher filter. */
  teacherUid: string;
  /** Assignment (entry) id, or 'all' for no assignment filter. */
  assignmentId: string;
  /**
   * Inclusive millisecond epoch range filter applied to `createdAt`.
   * `null` means no date filter.
   */
  dateRange: { from: number; to: number } | null;
}

export interface ContributionFilters {
  /** Class-period string, or 'all' for no class filter. */
  classPeriod: string;
}

// ---------------------------------------------------------------------------
// filterEntries
// ---------------------------------------------------------------------------

/**
 * Filter the PLC assignment index entries by type, teacher, assignment id,
 * and date range.  All active filters are ANDed together.
 */
export function filterEntries(
  entries: PlcAssignmentIndexEntry[],
  filters: SharedDataFilters
): PlcAssignmentIndexEntry[] {
  return entries.filter((entry) => {
    if (filters.type !== 'all' && entry.kind !== filters.type) return false;
    if (filters.teacherUid !== 'all' && entry.ownerUid !== filters.teacherUid)
      return false;
    if (filters.assignmentId !== 'all' && entry.id !== filters.assignmentId)
      return false;
    if (filters.dateRange !== null) {
      const { from, to } = filters.dateRange;
      if (entry.createdAt < from || entry.createdAt > to) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// filterContributionResponses
// ---------------------------------------------------------------------------

/**
 * Return a shallow copy of each contribution with its `responses` array
 * filtered to the given class period.  When `classPeriod === 'all'` the
 * original responses array is kept (no copy overhead).
 *
 * The contribution's top-level metadata (`teacherUid`, `teacherName`, etc.)
 * is preserved unchanged so callers can still group / aggregate correctly.
 */
export function filterContributionResponses(
  contributions: PlcContribution[],
  filters: ContributionFilters
): PlcContribution[] {
  if (filters.classPeriod === 'all') return contributions;
  return contributions.map((c) => ({
    ...c,
    responses: c.responses.filter((r) => r.classPeriod === filters.classPeriod),
  }));
}

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

export interface SharedDataSummary {
  /** Rounded integer percentage, or null when no completed responses exist. */
  avgScore: number | null;
  /** Number of unique teacher UIDs that contributed. */
  teacherCount: number;
  /** Total number of student response rows (all statuses). */
  studentCount: number;
}

/**
 * Compute a headline summary across a set of contributions.
 *
 * - `avgScore`: mean of `response.scorePercent` for all completed responses
 *   that have a non-null scorePercent.  null when no such responses exist.
 * - `teacherCount`: distinct `teacherUid` values across contributions.
 * - `studentCount`: total responses across all contributions and statuses.
 */
export function summarize(contributions: PlcContribution[]): SharedDataSummary {
  const teacherUids = new Set<string>();
  let studentCount = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  for (const c of contributions) {
    teacherUids.add(c.teacherUid);
    for (const r of c.responses) {
      studentCount++;
      if (r.status === 'completed' && typeof r.scorePercent === 'number') {
        scoreSum += r.scorePercent;
        scoreCount++;
      }
    }
  }

  return {
    avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    teacherCount: teacherUids.size,
    studentCount,
  };
}

// ---------------------------------------------------------------------------
// groupContributionsByQuizIdentity
// ---------------------------------------------------------------------------

/** One results card's worth of contributions: every member's run of the
 *  SAME logical quiz, grouped by cross-teacher quiz identity. */
export interface ContributionQuizGroup {
  /** `syncGroupId` when set, else `quizId` — the cross-teacher quiz identity. */
  identity: string;
  /** Best-effort display title (no template lookup is available here). */
  title: string;
  /** Every contribution that shares this quiz identity. */
  contributions: PlcContribution[];
  /** Distinct teacher UIDs that contributed to this quiz. */
  teacherUids: Set<string>;
  /** Most-recent contribution `updatedAt` — drives sort + date filtering. */
  latestUpdatedAt: number;
}

/**
 * Group contributions into one bucket per distinct quiz identity
 * (`syncGroupId ?? quizId`) — the SAME grouping `PlcAnalyticsBody` /
 * `plcAnalyticsAggregate.groupBySchema` use to identify "the same logical
 * quiz" across teachers.
 *
 * This is the fix for the double-count bug: the old code matched
 * contributions to an assignment-index entry by `teacherUid === ownerUid`
 * only, so a teacher with two assignments had ALL their contributions
 * counted on BOTH cards. Grouping by the contribution's OWN quiz identity
 * counts each contribution exactly once, on exactly one card.
 *
 * `titleByOwnerUid` is an optional best-effort label source: when every
 * contribution in a group shares a single owner that has an index-entry
 * title, we use it. Otherwise we fall back to the first question text (the
 * same fallback `PlcAnalyticsBody` uses when no template title is found).
 */
export function groupContributionsByQuizIdentity(
  contributions: PlcContribution[],
  titleByOwnerUid?: Map<string, string>
): ContributionQuizGroup[] {
  const buckets = new Map<string, PlcContribution[]>();
  for (const c of contributions) {
    const identity = c.syncGroupId ?? c.quizId;
    const existing = buckets.get(identity);
    if (existing) existing.push(c);
    else buckets.set(identity, [c]);
  }

  const groups: ContributionQuizGroup[] = [];
  for (const [identity, members] of buckets.entries()) {
    const teacherUids = new Set(members.map((m) => m.teacherUid));
    const latestUpdatedAt = members.reduce(
      (max, c) => (c.updatedAt > max ? c.updatedAt : max),
      0
    );
    // Title: prefer a single-owner index-entry title, else first question
    // text, else a generic label.
    let title = '';
    if (titleByOwnerUid && teacherUids.size === 1) {
      const onlyUid = members[0]?.teacherUid;
      title = (onlyUid ? titleByOwnerUid.get(onlyUid) : undefined) ?? '';
    }
    if (!title) {
      title = members[0]?.questionsSnapshot[0]?.text?.slice(0, 60) ?? '';
    }
    groups.push({
      identity,
      title,
      contributions: members,
      teacherUids,
      latestUpdatedAt,
    });
  }

  // Most-recent first — the freshest results read at the top.
  groups.sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt);
  return groups;
}

// ===========================================================================
// AGGREGATE-DRIVEN view model (Wave 3 — Decisions 6.0 + 3.3 + 4.0c, §6.2)
// ===========================================================================
//
// The Data section reads the anonymized server-written `PlcAssessmentAggregate`
// rollups instead of every teacher's raw `PlcContribution` (the FERPA fix — no
// student names reach a member). Each aggregate becomes ONE result card,
// enriched by its matching designated `PlcCommonAssessment` (joined by id — the
// aggregator keys the aggregate doc on the canonical assessment id when a
// designated assessment matches the contribution's syncGroupId; otherwise the
// id is `syncGroupId ?? quizId`, and the card offers a "Designate as common
// assessment" affordance to promote that group to a first-class assessment).
//
// These helpers are pure (no React / no Firebase) so they unit-test cleanly.

/** How a card may be filtered by the assessment lifecycle status. */
export type AssessmentStatusFilter = PlcCommonAssessment['status'] | 'all';

/** Filter shape for the aggregate-driven Data section. All ANDed together. */
export interface SharedDataAggregateFilters {
  /** 'all' means no kind filter. Kind comes from the designated assessment. */
  type: 'all' | 'quiz' | 'video-activity';
  /** Teacher uid (matched against `perTeacher`), or 'all'. */
  teacherUid: string;
  /** Unit label (from the designated assessment), or 'all'. */
  unitLabel: string;
  /** Lifecycle status (from the designated assessment), or 'all'. */
  status: AssessmentStatusFilter;
  /** Case-insensitive substring over the card title; '' means no search. */
  search: string;
}

/** A single per-class compare row (PRD §11: `classPeriod` is the class key;
 *  in the anonymized aggregate that signal survives as the per-teacher rollup
 *  with its `classCount`). Anonymized — NEVER carries student names. */
export interface AssessmentClassRow {
  teacherUid: string;
  teacherName: string;
  classCount: number;
  averagePercent: number;
  studentCount: number;
  /** True when this row is the signed-in member's own results. */
  isYou: boolean;
  /** True when this teacher has actually contributed to the rollup. */
  hasRun: boolean;
}

/** A weak-question row, sorted ascending by `correctPercent`. */
export interface AssessmentWeakQuestion {
  questionId: string;
  text: string;
  correctPercent: number;
  points: number;
}

/** One "who has run it" entry — a team member cross-referenced against the
 *  aggregate's contributing teachers. */
export interface AssessmentRunStatus {
  teacherUid: string;
  teacherName: string;
  hasRun: boolean;
}

/** A fully-derived aggregate result card — the unit `PlcSharedDataBody` renders. */
export interface AssessmentDataCard {
  /** Canonical assessment id (== aggregate doc id == comments thread suffix). */
  assessmentId: string;
  /** Display title — designated assessment title, else first weak-question text. */
  title: string;
  /** The designated common assessment, if this group has been promoted. */
  assessment: PlcCommonAssessment | null;
  /** Whether the team has designated a common assessment for this group. */
  isDesignated: boolean;
  /** Kind (from the assessment when designated, else assumed quiz — the only
   *  shape that writes contributions today). */
  kind: 'quiz' | 'video-activity';
  /** The syncGroupId used to designate this group (assessment's, else id). */
  syncGroupId: string;
  /** The anonymized rollup this card renders. */
  aggregate: PlcAssessmentAggregate;
  teamAveragePercent: number;
  teacherCount: number;
  studentCount: number;
  /** Weakest questions first (ascending correctPercent). */
  weakestQuestions: AssessmentWeakQuestion[];
  /** Per-class (per-teacher) compare rows, strongest average first. */
  perClass: AssessmentClassRow[];
  /** Cross-reference of every member against "has run it". */
  whoRan: AssessmentRunStatus[];
  /** Count of members who have contributed results. */
  ranCount: number;
  /** Total members the assessment is expected across (team size). */
  expectedCount: number;
  /** When the rollup last recomputed (ms). 0 means a pending serverTimestamp. */
  ranAt: number;
  /** True while the rollup is behind a just-published contribution. */
  updating: boolean;
}

/** A team member as needed for the who-ran-it cross-reference + per-class "you". */
export interface SharedDataTeamMember {
  uid: string;
  displayName: string;
}

/**
 * Sort an aggregate's per-question rollup weakest-first (ascending
 * `correctPercent`) and take the first `limit`. Ties break by `questionId` for
 * a stable order. Returns a fresh array (does not mutate the input).
 */
export function weakestQuestions(
  perQuestion: PlcAssessmentAggregate['perQuestion'],
  limit = 3
): AssessmentWeakQuestion[] {
  return [...perQuestion]
    .sort(
      (a, b) =>
        a.correctPercent - b.correctPercent ||
        a.questionId.localeCompare(b.questionId)
    )
    .slice(0, Math.max(0, limit));
}

/**
 * Whether the aggregate is STALE relative to a just-published contribution
 * (PRD §9 lag mitigation): the function debounces, so for a brief window a
 * member's freshly published result lands before `ranAt` catches up. We treat
 * the rollup as "updating…" when either
 *   - `ranAt` is 0 (the serverTimestamp hasn't resolved yet — a pending write), or
 *   - the newest contribution feeding this group is newer than `ranAt`.
 *
 * `latestContributionUpdatedAt` is the max `updatedAt` across the contributions
 * that feed THIS aggregate — sourced from the owning teacher's own contribution
 * read (the only contribution stream a member can still see post-tightening) so
 * a teacher who just published sees their own card flip to "updating…".
 */
export function isAggregateStale(
  aggregate: PlcAssessmentAggregate,
  latestContributionUpdatedAt: number
): boolean {
  if (aggregate.ranAt === 0) return true;
  return latestContributionUpdatedAt > aggregate.ranAt;
}

/**
 * The latest contribution `updatedAt` for each aggregate group, keyed by the
 * aggregate id the contribution rolls up to. A contribution rolls up to the
 * designated assessment id when one matches its `syncGroupId`, else to
 * `syncGroupId ?? quizId` (mirrors the aggregator's `resolveAggregateId`). Used
 * to drive the per-card "updating…" state from the member's own contribution
 * read without exposing any other teacher's PII.
 */
export function latestContributionByAggregateId(
  contributions: PlcContribution[],
  assessments: PlcCommonAssessment[]
): Map<string, number> {
  // syncGroupId → designated assessment id (live, non-deleted only).
  const designatedBySyncGroup = new Map<string, string>();
  for (const a of assessments) {
    if (a.deletedAt != null) continue;
    const existing = designatedBySyncGroup.get(a.syncGroupId);
    // Deterministic tie-break (smallest id) mirrors the aggregator.
    if (!existing || a.id < existing) {
      designatedBySyncGroup.set(a.syncGroupId, a.id);
    }
  }
  const latest = new Map<string, number>();
  for (const c of contributions) {
    const fallback = c.syncGroupId ?? c.quizId;
    const aggId =
      (c.syncGroupId ? designatedBySyncGroup.get(c.syncGroupId) : undefined) ??
      fallback;
    const prev = latest.get(aggId) ?? 0;
    if (c.updatedAt > prev) latest.set(aggId, c.updatedAt);
  }
  return latest;
}

/**
 * Build the aggregate-driven result cards: one per aggregate, joined to its
 * designated `PlcCommonAssessment` by id, cross-referenced against the team
 * roster for "who's run it", and flagged "updating…" when the rollup lags a
 * just-published contribution.
 *
 * - `aggregates` — anonymized server rollups (the card data; no PII).
 * - `assessments` — live designated common assessments (title/kind/unit/status).
 * - `members` — team roster, for the who-ran-it cross-reference + per-class "you".
 * - `currentUid` — the signed-in member (marks their own per-class row).
 * - `latestContribByAggId` — `latestContributionByAggregateId(...)` output, for
 *   the staleness flag.
 */
export function buildAssessmentCards(
  aggregates: PlcAssessmentAggregate[],
  assessments: PlcCommonAssessment[],
  members: SharedDataTeamMember[],
  currentUid: string | null,
  latestContribByAggId: Map<string, number>
): AssessmentDataCard[] {
  const assessmentById = new Map<string, PlcCommonAssessment>();
  for (const a of assessments) {
    if (a.deletedAt == null) assessmentById.set(a.id, a);
  }

  const cards: AssessmentDataCard[] = aggregates.map((aggregate) => {
    const assessment = assessmentById.get(aggregate.assessmentId) ?? null;
    const isDesignated = assessment !== null;
    const kind = assessment?.kind ?? 'quiz';
    const syncGroupId = assessment?.syncGroupId ?? aggregate.assessmentId;

    const weak = weakestQuestions(aggregate.perQuestion);
    const ranUids = new Set(aggregate.perTeacher.map((p) => p.teacherUid));

    const perClass: AssessmentClassRow[] = [...aggregate.perTeacher]
      .sort(
        (a, b) =>
          b.averagePercent - a.averagePercent ||
          a.teacherName.localeCompare(b.teacherName)
      )
      .map((p) => ({
        teacherUid: p.teacherUid,
        teacherName: p.teacherName,
        classCount: p.classCount,
        averagePercent: p.averagePercent,
        studentCount: p.studentCount,
        isYou: currentUid != null && p.teacherUid === currentUid,
        hasRun: true,
      }));

    // Who-ran-it: cross-reference every team member against the rollup. Falls
    // back to the rollup's own teachers when the roster is unavailable.
    const rosterSource: SharedDataTeamMember[] =
      members.length > 0
        ? members
        : aggregate.perTeacher.map((p) => ({
            uid: p.teacherUid,
            displayName: p.teacherName,
          }));
    const whoRan: AssessmentRunStatus[] = rosterSource
      .map((m) => ({
        teacherUid: m.uid,
        teacherName: m.displayName,
        hasRun: ranUids.has(m.uid),
      }))
      .sort(
        (a, b) =>
          Number(b.hasRun) - Number(a.hasRun) ||
          a.teacherName.localeCompare(b.teacherName)
      );

    // Title precedence: designated assessment title, else weakest-question
    // text, else first-question text. Empty strings fall through (so a blank
    // assessment title doesn't blank the card) — hence the explicit non-empty
    // checks rather than `??` (which would stop at the empty string).
    const titleCandidates = [
      assessment?.title,
      weak[0]?.text?.slice(0, 60),
      aggregate.perQuestion[0]?.text?.slice(0, 60),
    ];
    const title = titleCandidates.find((c) => c && c.length > 0) ?? '';

    const latestContrib = latestContribByAggId.get(aggregate.assessmentId) ?? 0;

    return {
      assessmentId: aggregate.assessmentId,
      title,
      assessment,
      isDesignated,
      kind,
      syncGroupId,
      aggregate,
      teamAveragePercent: aggregate.teamAveragePercent,
      teacherCount: aggregate.teacherCount,
      studentCount: aggregate.studentCount,
      weakestQuestions: weak,
      perClass,
      whoRan,
      ranCount: whoRan.filter((w) => w.hasRun).length,
      expectedCount: whoRan.length,
      ranAt: aggregate.ranAt,
      updating: isAggregateStale(aggregate, latestContrib),
    };
  });

  // Most-results first, then alphabetical for a stable order.
  cards.sort(
    (a, b) => b.studentCount - a.studentCount || a.title.localeCompare(b.title)
  );
  return cards;
}

/** Apply the aggregate-driven filters to the built cards. */
export function filterAssessmentCards(
  cards: AssessmentDataCard[],
  filters: SharedDataAggregateFilters
): AssessmentDataCard[] {
  const needle = filters.search.trim().toLowerCase();
  return cards.filter((card) => {
    if (filters.type !== 'all' && card.kind !== filters.type) return false;
    if (
      filters.teacherUid !== 'all' &&
      !card.aggregate.perTeacher.some(
        (p) => p.teacherUid === filters.teacherUid
      )
    ) {
      return false;
    }
    if (filters.unitLabel !== 'all') {
      if ((card.assessment?.unitLabel ?? '') !== filters.unitLabel)
        return false;
    }
    if (filters.status !== 'all') {
      if ((card.assessment?.status ?? null) !== filters.status) return false;
    }
    if (needle.length > 0 && !card.title.toLowerCase().includes(needle)) {
      return false;
    }
    return true;
  });
}

/** Distinct teachers across all aggregates' `perTeacher` rows, name-sorted. */
export function collectAggregateTeachers(
  aggregates: PlcAssessmentAggregate[]
): { uid: string; name: string }[] {
  const map = new Map<string, string>();
  for (const agg of aggregates) {
    for (const p of agg.perTeacher) map.set(p.teacherUid, p.teacherName);
  }
  return Array.from(map.entries())
    .map(([uid, name]) => ({ uid, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Distinct, non-empty unit labels across designated assessments, sorted. */
export function collectUnitLabels(
  assessments: PlcCommonAssessment[]
): string[] {
  const set = new Set<string>();
  for (const a of assessments) {
    if (a.deletedAt != null) continue;
    if (a.unitLabel && a.unitLabel.length > 0) set.add(a.unitLabel);
  }
  return Array.from(set).sort();
}
