// useUnifiedAssignments — normalizes the five per-teacher assignment collections into one flat, sortable list for the Assignments hub (spec §5 D1). Read-only.

import { useMemo } from 'react';
import {
  useQuizAssignments,
  type UseQuizAssignmentsResult,
} from '@/hooks/useQuizAssignments';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import { useGuidedLearningAssignments } from '@/hooks/useGuidedLearningAssignments';
import { useMiniAppAssignments } from '@/hooks/useMiniAppAssignments';
import { useFlashcardAssignments } from '@/hooks/useFlashcardAssignments';
import type { ClassRoster, StudentOverride, StudentTargetRef } from '@/types';

export type AssignmentKind =
  | 'quiz'
  | 'video-activity'
  | 'guided-learning'
  | 'mini-app'
  | 'flashcards';

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
  /** Class ids mirrored from the session doc (e.g. `schoology:<contextId>`), when present. */
  classIds?: string[];
  /** Display titles for `classIds` (Schoology section titles), when present. */
  classPeriodByClassId?: Record<string, string>;
  targetStudents?: StudentTargetRef[];
  /** Students skipped at assign time, so re-opening the editor shows the skip. */
  excludedTargets?: StudentTargetRef[];
  /** Teacher's own per-student overrides, keyed by `studentTargetRefKey` (D2 "modified" marker). */
  overridesBySourcedId?: Record<string, StudentOverride>;
  /** Individually-targeted refs removed via the hub (M17 §5 D3) — kept so a
   *  removed-but-submitted student's row still renders, marked "removed". */
  removedStudentRefs?: StudentTargetRef[];
  /** Quiz rows only: PLC whose assessments pool this assignment's results. */
  plc?: { id: string; name: string };
  /** Quiz rows only: source quiz id (D12 pool matching). */
  quizId?: string;
  /** Quiz rows only: the assignment's synced group id, when synced. */
  syncGroupId?: string;
  /** Flashcards rows only: Check (collects a submission) or Study. */
  flashcardKind?: 'check' | 'study';
}

/** Retroactive PLC results actions, forwarded from `useQuizAssignments`. */
export interface QuizPlcActions {
  share: UseQuizAssignmentsResult['shareAssignmentWithPlc'];
  stopSharing: UseQuizAssignmentsResult['stopSharingAssignmentWithPlc'];
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
): {
  rows: UnifiedAssignmentRow[];
  loading: boolean;
  quizPlcActions: QuizPlcActions;
} => {
  const quiz = useQuizAssignments(userId);
  const va = useVideoActivityAssignments(userId);
  const gl = useGuidedLearningAssignments(userId);
  const miniApp = useMiniAppAssignments(userId);
  const flashcards = useFlashcardAssignments(userId);

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
      classIds: a.classIds,
      classPeriodByClassId: a.classPeriodByClassId,
      targetStudents: a.targetStudents,
      excludedTargets: a.excludedTargets,
      overridesBySourcedId: a.overridesBySourcedId,
      removedStudentRefs: a.removedStudentRefs,
      ...(a.plc ? { plc: { id: a.plc.id, name: a.plc.name } } : {}),
      quizId: a.quizId,
      syncGroupId: a.sync?.groupId,
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
      classIds: a.classIds,
      classPeriodByClassId: a.classPeriodByClassId,
      targetStudents: a.targetStudents,
      excludedTargets: a.excludedTargets,
      overridesBySourcedId: a.overridesBySourcedId,
      removedStudentRefs: a.removedStudentRefs,
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
      excludedTargets: a.excludedTargets,
      overridesBySourcedId: a.overridesBySourcedId,
      removedStudentRefs: a.removedStudentRefs,
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
        excludedTargets: a.excludedTargets,
        overridesBySourcedId: a.overridesBySourcedId,
        removedStudentRefs: a.removedStudentRefs,
      })
    );

    const flashcardRows: UnifiedAssignmentRow[] = flashcards.assignments.map(
      (a) => ({
        id: a.id,
        kind: 'flashcards',
        title: a.setTitle,
        className:
          (a.rosterIds ?? []).some((id) => rosterNamesById.has(id)) ||
          !a.periodNames?.length
            ? resolveClassName(undefined, a.rosterIds, rosterNamesById)
            : a.periodNames.join(', '),
        status: a.status === 'ended' ? 'inactive' : 'active',
        targetMode: a.targetMode === 'students' ? 'students' : 'class',
        targetSkippedCount: a.targetSkippedCount ?? 0,
        openAt: a.openAt,
        closeAt: a.closeAt,
        createdAt: a.createdAt,
        sessionId: a.sessionId,
        rosterIds: a.rosterIds,
        periodNames: a.periodNames,
        classIds: a.classIds,
        targetStudents: a.targetStudents,
        excludedTargets: a.excludedTargets,
        overridesBySourcedId: a.overridesBySourcedId,
        removedStudentRefs: a.removedStudentRefs,
        flashcardKind: a.kind,
      })
    );

    return [
      ...quizRows,
      ...vaRows,
      ...glRows,
      ...miniAppRows,
      ...flashcardRows,
    ].sort((a, b) => b.createdAt - a.createdAt);
  }, [
    quiz.assignments,
    va.assignments,
    gl.assignments,
    miniApp.assignments,
    flashcards.assignments,
    rosterNamesById,
  ]);

  return {
    rows,
    loading:
      quiz.loading ||
      va.loading ||
      gl.loading ||
      miniApp.loading ||
      flashcards.loading,
    quizPlcActions: {
      share: quiz.shareAssignmentWithPlc,
      stopSharing: quiz.stopSharingAssignmentWithPlc,
    },
  };
};
