/**
 * Pure row-building + filtering for the merged PLC Assessments list
 * (docs/plans/PLC_ASSESSMENT_DATA.md D5/D13). No React, no Firebase.
 */

import type {
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcQuizEntry,
  QuestionTargetTag,
} from '@/types';
import {
  countItemsByFolder,
  filterByFolder,
  type HasFolderId,
} from '@/components/common/library/folderFilters';

export type AssessmentRowStatus = 'notStarted' | 'inProgress' | 'scored';

export type AssessmentListFilter =
  | 'all'
  | 'notStarted'
  | 'inProgress'
  | 'scored'
  | 'archived';

export interface AssessmentListRow {
  /** Assessment id, or `library:<syncGroupId>` for a library-only row. */
  id: string;
  /** Null for library-only rows (nothing to open yet). */
  assessmentId: string | null;
  title: string;
  kind: 'quiz' | 'video-activity';
  status: AssessmentRowStatus;
  /** True when the assessment was archived (`status === 'closed'`). */
  archived: boolean;
  /** From the PLC library entry when one exists. */
  questionCount: number | null;
  teacherCount: number;
  memberCount: number;
  studentCount: number;
  /** Last aggregate recompute (ms); null before the first run. */
  ranAt: number | null;
  syncGroupId: string;
  sourceQuizId: string | null;
  sharedByName: string | null;
  sharedAt: number | null;
  /** Newest edit on the assessment record (ms); 0 for library-only rows. */
  updatedAt: number;
  /** PLC folder id (`plcs/{plcId}/folders`); `null` = root/no folder. */
  folderId: string | null;
  /** Id of the matched PLC library entry, or `null` when there isn't one. */
  plcQuizId: string | null;
  /** Distinct target/standard snapshots present in the aggregate. */
  targets: QuestionTargetTag[];
}

/** Schema-2 aggregates carry publish counts; schema-1 only knows students. */
export function aggregateStatus(
  aggregate: PlcAssessmentAggregate | null | undefined
): AssessmentRowStatus {
  if (!aggregate) return 'notStarted';
  const linked = aggregate.linkedSessionCount;
  const scored = aggregate.scoredStudentCount;
  if (typeof linked !== 'number' || typeof scored !== 'number') {
    return aggregate.studentCount > 0 ? 'inProgress' : 'notStarted';
  }
  if (linked === 0) return 'notStarted';
  return scored > 0 ? 'scored' : 'inProgress';
}

/** True when the aggregate carries a usable team average. */
export function hasTeamAverage(
  aggregate: PlcAssessmentAggregate | null | undefined
): boolean {
  if (!aggregate) return false;
  const scored = aggregate.scoredStudentCount;
  if (typeof scored !== 'number') return aggregate.studentCount > 0;
  return scored > 0;
}

/** Active members plus any non-member teacher whose session is linked, so "N of M" never exceeds M. */
export function teacherPoolSize(
  memberUids: readonly string[],
  aggregate: PlcAssessmentAggregate | null | undefined
): number {
  const pool = new Set(memberUids);
  for (const row of aggregate?.perTeacher ?? []) pool.add(row.teacherUid);
  return pool.size;
}

export interface BuildAssessmentRowsInput {
  assessments: PlcCommonAssessment[];
  aggregates: PlcAssessmentAggregate[];
  libraryEntries: PlcQuizEntry[];
  memberUids: readonly string[];
}

const STATUS_ORDER: Record<AssessmentRowStatus, number> = {
  inProgress: 0,
  scored: 1,
  notStarted: 2,
};

function aggregateTargets(
  aggregate: PlcAssessmentAggregate | null
): QuestionTargetTag[] {
  const tags = new Map<string, QuestionTargetTag>();
  for (const row of [
    ...(aggregate?.perTarget ?? []),
    ...(aggregate?.perStandard ?? []),
  ]) {
    if (!tags.has(row.targetId)) {
      tags.set(row.targetId, {
        id: row.targetId,
        kind: row.kind,
        ...(row.code ? { code: row.code } : {}),
        label: row.label,
      });
    }
  }
  return Array.from(tags.values());
}

function sortRows(rows: AssessmentListRow[]): AssessmentListRow[] {
  return [...rows].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (order !== 0) return order;
    const aTime =
      a.assessmentId === null ? (a.sharedAt ?? 0) : (a.ranAt ?? a.updatedAt);
    const bTime =
      b.assessmentId === null ? (b.sharedAt ?? 0) : (b.ranAt ?? b.updatedAt);
    if (aTime !== bTime) return bTime - aTime;
    return a.title.localeCompare(b.title);
  });
}

/**
 * One row per live quiz assessment, plus one per PLC library quiz whose
 * `syncGroupId` has no live assessment ("library only").
 */
export function buildAssessmentRows(
  input: BuildAssessmentRowsInput
): AssessmentListRow[] {
  const aggregateById = new Map<string, PlcAssessmentAggregate>();
  for (const agg of input.aggregates) {
    aggregateById.set(agg.assessmentId, agg);
  }
  const libraryBySyncGroup = new Map<string, PlcQuizEntry>();
  for (const entry of input.libraryEntries) {
    if (entry.deletedAt != null) continue;
    const existing = libraryBySyncGroup.get(entry.syncGroupId);
    if (!existing || entry.sharedAt < existing.sharedAt) {
      libraryBySyncGroup.set(entry.syncGroupId, entry);
    }
  }

  const rows: AssessmentListRow[] = [];
  const coveredSyncGroups = new Set<string>();
  for (const assessment of input.assessments) {
    if (assessment.deletedAt != null || assessment.kind !== 'quiz') continue;
    coveredSyncGroups.add(assessment.syncGroupId);
    const aggregate = aggregateById.get(assessment.id) ?? null;
    const library = libraryBySyncGroup.get(assessment.syncGroupId) ?? null;
    const title =
      firstNonEmpty([assessment.title, aggregate?.title, library?.title]) ?? '';
    rows.push({
      id: assessment.id,
      assessmentId: assessment.id,
      title,
      kind: 'quiz',
      status: aggregateStatus(aggregate),
      archived: assessment.status === 'closed' || library?.archived === true,
      questionCount: library?.questionCount ?? null,
      teacherCount: aggregate?.teacherCount ?? 0,
      memberCount: teacherPoolSize(input.memberUids, aggregate),
      studentCount: aggregate?.studentCount ?? 0,
      ranAt: aggregate && aggregate.ranAt > 0 ? aggregate.ranAt : null,
      syncGroupId: assessment.syncGroupId,
      sourceQuizId: assessment.sourceQuizId ?? null,
      sharedByName: library?.sharedByName ?? null,
      sharedAt: library?.sharedAt ?? null,
      updatedAt: assessment.updatedAt,
      folderId: assessment.folderId ?? library?.folderId ?? null,
      plcQuizId: library?.id ?? null,
      targets: aggregateTargets(aggregate),
    });
  }

  for (const [syncGroupId, entry] of libraryBySyncGroup) {
    if (coveredSyncGroups.has(syncGroupId)) continue;
    rows.push({
      id: `library:${syncGroupId}`,
      assessmentId: null,
      title: entry.title,
      kind: 'quiz',
      status: 'notStarted',
      archived: entry.archived === true,
      questionCount: entry.questionCount,
      teacherCount: 0,
      memberCount: input.memberUids.length,
      studentCount: 0,
      ranAt: null,
      syncGroupId,
      sourceQuizId: entry.quizId ?? null,
      sharedByName: entry.sharedByName,
      sharedAt: entry.sharedAt,
      updatedAt: 0,
      folderId: entry.folderId ?? null,
      plcQuizId: entry.id,
      targets: [],
    });
  }

  return sortRows(rows);
}

/** Apply the status chip plus a case-insensitive title search. */
export function filterAssessmentRows(
  rows: AssessmentListRow[],
  filter: AssessmentListFilter,
  search: string,
  targetId: string | null = null
): AssessmentListRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === 'archived') {
      if (!row.archived) return false;
    } else {
      if (row.archived) return false;
      if (filter !== 'all' && row.status !== filter) return false;
    }
    if (needle.length > 0 && !row.title.toLowerCase().includes(needle)) {
      return false;
    }
    if (targetId && !row.targets.some((target) => target.id === targetId)) {
      return false;
    }
    return true;
  });
}

/** Keep only rows in `selectedFolderId` (`null` = every row). */
export function filterRowsByFolder(
  rows: AssessmentListRow[],
  selectedFolderId: string | null
): AssessmentListRow[] {
  return filterByFolder(
    rows as (AssessmentListRow & HasFolderId)[],
    selectedFolderId
  );
}

/** Per-folder row counts (+ `root`) for the sidebar badges. */
export function countRowsByFolder(
  rows: AssessmentListRow[]
): Record<string, number> {
  return countItemsByFolder(rows as (AssessmentListRow & HasFolderId)[]);
}

/** Distinct, trimmed, non-empty `unitLabel` values from live quiz assessments, sorted. */
export function suggestedFolderNames(
  assessments: PlcCommonAssessment[]
): string[] {
  const names = new Set<string>();
  for (const a of assessments) {
    if (a.deletedAt != null || a.kind !== 'quiz') continue;
    const trimmed = a.unitLabel?.trim();
    if (trimmed) names.add(trimmed);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function firstNonEmpty(
  values: Array<string | undefined>
): string | undefined {
  return values.find((v) => typeof v === 'string' && v.trim().length > 0);
}

export function formatShortDate(ms: number, locale: string): string {
  try {
    return new Date(ms).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return new Date(ms).toLocaleDateString();
  }
}

type PerQuestion = PlcAssessmentAggregate['perQuestion'][number];

/** Worst-first; unscored questions (null incorrectPercent) sink to the bottom. */
export function sortWorstFirst(perQuestion: PerQuestion[]): PerQuestion[] {
  return perQuestion
    .filter(
      (question) =>
        question.servedCount === undefined || question.servedCount >= 5
    )
    .sort((a, b) => {
      const ai = a.incorrectPercent ?? null;
      const bi = b.incorrectPercent ?? null;
      if (ai === null && bi === null)
        return a.questionId.localeCompare(b.questionId);
      if (ai === null) return 1;
      if (bi === null) return -1;
      return bi - ai || a.questionId.localeCompare(b.questionId);
    });
}
