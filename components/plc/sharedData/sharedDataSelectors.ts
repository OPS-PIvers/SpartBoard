/**
 * Pure aggregate view-model helpers shared by Meeting Mode.
 *
 * No React, no Firebase — all functions are side-effect free so they can
 * be heavily unit-tested without mocking.
 */

import type { PlcAssessmentAggregate, PlcCommonAssessment } from '@/types';

// ===========================================================================
// AGGREGATE-DRIVEN view model (Wave 3 — Decisions 6.0 + 3.3 + 4.0c, §6.2)
// ===========================================================================
//
// Meeting Mode reads the anonymized server-written `PlcAssessmentAggregate`
// rollups (no student names reach a member). Each aggregate becomes ONE result
// card, enriched by its matching `PlcCommonAssessment` (joined by id).
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

/** A fully-derived aggregate result card — the unit Meeting Mode renders. */
export interface AssessmentDataCard {
  /** Canonical assessment id (== aggregate doc id == comments thread suffix). */
  assessmentId: string;
  /** Display title — assessment title, else aggregate title, else weak-question text. */
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
  /** True while the rollup's `ranAt` is a pending serverTimestamp. */
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
 * Build the aggregate-driven result cards: one per aggregate, joined to its
 * `PlcCommonAssessment` by id and cross-referenced against the team roster for
 * "who's run it".
 *
 * - `aggregates` — anonymized server rollups (the card data; no PII).
 * - `assessments` — live common assessments (title/kind/unit/status).
 * - `members` — team roster, for the who-ran-it cross-reference + per-class "you".
 * - `currentUid` — the signed-in member (marks their own per-class row).
 */
export function buildAssessmentCards(
  aggregates: PlcAssessmentAggregate[],
  assessments: PlcCommonAssessment[],
  members: SharedDataTeamMember[],
  currentUid: string | null
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

    // Title precedence: designated assessment title, else the server-written
    // aggregate title, else weakest-question text, else first-question text.
    // Empty strings fall through — hence the non-empty checks rather than `??`.
    const titleCandidates = [
      assessment?.title,
      aggregate.title,
      weak[0]?.text?.slice(0, 60),
      aggregate.perQuestion[0]?.text?.slice(0, 60),
    ];
    const title = titleCandidates.find((c) => c && c.length > 0) ?? '';

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
      updating: aggregate.ranAt === 0,
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
