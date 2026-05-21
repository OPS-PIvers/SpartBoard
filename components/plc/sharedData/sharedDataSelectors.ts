/**
 * Pure filter + aggregation helpers for the Shared Data view.
 *
 * No React, no Firebase — all functions are side-effect free so they can
 * be heavily unit-tested without mocking.
 */

import type { PlcAssignmentIndexEntry, PlcContribution } from '@/types';

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
