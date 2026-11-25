import { useCallback, useMemo } from 'react';
import type { ClassRoster, QuizAssignment } from '@/types';
import {
  useAssignmentClassActions,
  type AssignmentClassActions,
  type AssignmentLifecycle,
} from '@/hooks/useAssignmentClassActions';
import { useSetAssignmentTargets } from '@/hooks/useSetAssignmentTargets';
import { useAuth } from '@/context/useAuth';
import { hasStudentPointers } from '@/utils/studentTargetRef';
import {
  clearedWindowRule,
  syncPointerWindows,
  type StaleWindowRule,
} from '@/utils/pointerWindowSync';
import type { UseQuizAssignmentsResult } from '@/hooks/useQuizAssignments';
import {
  END_TURN_IN_DELAY_MS,
  finalizeClassQuizResponses,
} from '@/utils/quizFinalizeOpenResponses';

/** The whole-assignment writes `useQuizAssignments` already owns; D21 drives them. */
export type QuizLifecycle = Pick<
  UseQuizAssignmentsResult,
  | 'pauseAssignment'
  | 'resumeAssignment'
  | 'deactivateAssignment'
  | 'reopenAssignment'
>;

/** Per-class actions for the Assigned tab; a null key is the whole single-line assignment (D15). */
export type QuizClassActions = AssignmentClassActions;

const QUIZ_COLLECTIONS = {
  sessionCollection: 'quiz_sessions',
  assignmentCollection: 'quiz_assignments',
};

/** Quiz class actions that keep the stored overall status in step (ASSIGNED_TAB.md D21). */
export function useQuizClassActions(
  assignment: QuizAssignment | null,
  lifecycle: QuizLifecycle,
  rosters: readonly Pick<ClassRoster, 'id' | 'bellPeriod'>[] | undefined,
  /** Shown which scheduled students kept the quiz live after a Close. */
  onHeld?: AssignmentLifecycle['onHeld']
): QuizClassActions {
  const {
    pauseAssignment,
    resumeAssignment,
    deactivateAssignment,
    reopenAssignment,
  } = lifecycle;
  const { setAssignmentTargets } = useSetAssignmentTargets();
  // Schedule for later's flag also keeps a fully closed quiz live for its scheduled students.
  const keepLiveForPasses =
    useAuth().canAccessFeature?.('student-set-time') === true;
  // Accommodated and skipped students read the window off their pointer docs.
  const syncStudentWindows = useCallback(
    (
      assignmentId: string,
      patch: { openAt?: null; closeAt?: null } | null,
      rule: StaleWindowRule
    ) =>
      !assignment || !hasStudentPointers(assignment)
        ? Promise.resolve()
        : syncPointerWindows(
            setAssignmentTargets,
            {
              uid: assignment.teacherUid,
              kind: 'quiz',
              assignmentCollection: QUIZ_COLLECTIONS.assignmentCollection,
              assignmentId,
              fallback: assignment,
            },
            patch,
            rule
          ),
    [assignment, setAssignmentTargets]
  );

  const quizLifecycle = useMemo<AssignmentLifecycle>(
    () => ({
      pause: pauseAssignment,
      resume: resumeAssignment,
      end: deactivateAssignment,
      reopen: reopenAssignment,
      turnInClass: finalizeClassQuizResponses,
      turnInDelayMs: END_TURN_IN_DELAY_MS,
      endTurnsIn: true,
      reopenClearsMarks: true,
      keepLiveForPasses,
      onHeld,
      // Once the class close is gone, any per-student close (even one not yet reached) would cut that student off alone.
      onWindowCleared: (assignmentId, patch) =>
        syncStudentWindows(assignmentId, patch, clearedWindowRule(patch)),
      // A class row has its own clock; only a student's expired close or later start still holds them out.
      onClassOpened: (assignmentId) =>
        syncStudentWindows(assignmentId, null, {
          closeAt: 'expired',
          futureOpenAt: true,
        }),
    }),
    [
      pauseAssignment,
      resumeAssignment,
      deactivateAssignment,
      reopenAssignment,
      syncStudentWindows,
      keepLiveForPasses,
      onHeld,
    ]
  );
  return useAssignmentClassActions(
    assignment,
    QUIZ_COLLECTIONS,
    quizLifecycle,
    rosters
  );
}
