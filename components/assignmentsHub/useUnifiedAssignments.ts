// useUnifiedAssignments — normalizes the four per-teacher assignment collections into one flat, sortable list for the Assignments hub (spec §5 D1). Read-only.

import { useMemo } from 'react';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import { useGuidedLearningAssignments } from '@/hooks/useGuidedLearningAssignments';
import { useMiniAppAssignments } from '@/hooks/useMiniAppAssignments';
import type { ClassRoster, StudentOverride, StudentTargetRef } from '@/types';

export type AssignmentKind =
  | 'quiz'
  | 'video-activity'
  | 'guided-learning'
  | 'mini-app';

/** Lifecycle status for the hub's status filter chip; 'paused' only applies to quiz/video-activity kinds. */
export type UnifiedAssignmentStatus = 'active' | 'paused' | 'inactive';

export interface UnifiedAssignmentRow {
  id: string;
  kind: AssignmentKind;
  title: string;
  className: string;
  status: UnifiedAssignmentStatus;
  targetMode: 'class' | 'students';
  targetSkippedCount: number;
  openAt?: number | null;
  closeAt?: number | null;
  createdAt: number;
  /** Paired session doc id — always `id` (1:1 shared UUID, spec §1). D2 name/status resolution. */
  sessionId: string;
  /** Raw targeting fields, passed through for D2's `resolveAssignmentTargets` + pseudonym lookups. */
  rosterIds?: string[];
  periodNames?: string[];
  targetStudents?: StudentTargetRef[];
  /** Teacher's own per-student overrides, keyed by `studentTargetRefKey` (D2 "modified" marker). */
  overridesBySourcedId?: Record<string, StudentOverride>;
}

function resolveClassName(
  className: string | undefined,
  rosterIds: string[] | undefined,
  rosterNamesById: Map<string, string>
): string {
  if (className && className.trim()) return className;
  if (rosterIds && rosterIds.length > 0) {
    const names = rosterIds
      .map((id) => rosterNamesById.get(id))
      .filter((n): n is string => !!n);
    if (names.length > 0) return names.join(', ');
  }
  return '—';
}

export const useUnifiedAssignments = (
  userId: string | undefined,
  rosters: ClassRoster[]
): { rows: UnifiedAssignmentRow[]; loading: boolean } => {
  const quiz = useQuizAssignments(userId);
  const va = useVideoActivityAssignments(userId);
  const gl = useGuidedLearningAssignments(userId);
  const miniApp = useMiniAppAssignments(userId);

  const rosterNamesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const roster of rosters) map.set(roster.id, roster.name);
    return map;
  }, [rosters]);

  const rows = useMemo<UnifiedAssignmentRow[]>(() => {
    const quizRows: UnifiedAssignmentRow[] = quiz.assignments.map((a) => ({
      id: a.id,
      kind: 'quiz',
      title: a.quizTitle,
      className: resolveClassName(a.className, a.rosterIds, rosterNamesById),
      status: a.status,
      targetMode: a.targetMode === 'students' ? 'students' : 'class',
      targetSkippedCount: a.targetSkippedCount ?? 0,
      openAt: a.openAt,
      closeAt: a.closeAt,
      createdAt: a.createdAt,
      sessionId: a.id,
      rosterIds: a.rosterIds,
      periodNames: a.periodNames,
      targetStudents: a.targetStudents,
      overridesBySourcedId: a.overridesBySourcedId,
    }));

    const vaRows: UnifiedAssignmentRow[] = va.assignments.map((a) => ({
      id: a.id,
      kind: 'video-activity',
      title: a.activityTitle,
      className: resolveClassName(a.className, a.rosterIds, rosterNamesById),
      status: a.status,
      targetMode: a.targetMode === 'students' ? 'students' : 'class',
      targetSkippedCount: a.targetSkippedCount ?? 0,
      openAt: a.openAt,
      closeAt: a.closeAt,
      createdAt: a.createdAt,
      sessionId: a.id,
      rosterIds: a.rosterIds,
      periodNames: a.periodNames,
      targetStudents: a.targetStudents,
      overridesBySourcedId: a.overridesBySourcedId,
    }));

    const glRows: UnifiedAssignmentRow[] = gl.assignments.map((a) => ({
      id: a.id,
      kind: 'guided-learning',
      title: a.setTitle,
      className: resolveClassName(undefined, a.rosterIds, rosterNamesById),
      status: a.status === 'archived' ? 'inactive' : 'active',
      targetMode: a.targetMode === 'students' ? 'students' : 'class',
      targetSkippedCount: a.targetSkippedCount ?? 0,
      openAt: a.openAt,
      closeAt: a.closeAt,
      createdAt: a.createdAt,
      sessionId: a.sessionId,
      rosterIds: a.rosterIds,
      targetStudents: a.targetStudents,
      overridesBySourcedId: a.overridesBySourcedId,
    }));

    const miniAppRows: UnifiedAssignmentRow[] = miniApp.assignments.map(
      (a) => ({
        id: a.id,
        kind: 'mini-app',
        title: a.appTitle,
        className: resolveClassName(
          a.assignmentName,
          a.rosterIds,
          rosterNamesById
        ),
        status: a.status === 'inactive' ? 'inactive' : 'active',
        targetMode: a.targetMode === 'students' ? 'students' : 'class',
        targetSkippedCount: a.targetSkippedCount ?? 0,
        openAt: a.openAt,
        closeAt: a.closeAt,
        createdAt: a.createdAt,
        sessionId: a.sessionId,
        rosterIds: a.rosterIds,
        targetStudents: a.targetStudents,
        overridesBySourcedId: a.overridesBySourcedId,
      })
    );

    return [...quizRows, ...vaRows, ...glRows, ...miniAppRows].sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }, [
    quiz.assignments,
    va.assignments,
    gl.assignments,
    miniApp.assignments,
    rosterNamesById,
  ]);

  return {
    rows,
    loading: quiz.loading || va.loading || gl.loading || miniApp.loading,
  };
};
