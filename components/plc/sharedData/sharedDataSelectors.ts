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
