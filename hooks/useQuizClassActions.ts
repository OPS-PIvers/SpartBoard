import { useMemo } from 'react';
import type { ClassRoster, QuizAssignment } from '@/types';
import {
  useAssignmentClassActions,
  type AssignmentClassActions,
  type AssignmentLifecycle,
} from '@/hooks/useAssignmentClassActions';
import { useSetAssignmentTargets } from '@/hooks/useSetAssignmentTargets';
import { hasStudentPointers } from '@/utils/studentTargetRef';
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
  rosters: readonly Pick<ClassRoster, 'id' | 'bellPeriod'>[] | undefined
): QuizClassActions {
  const {
    pauseAssignment,
    resumeAssignment,
    deactivateAssignment,
    reopenAssignment,
  } = lifecycle;
  const { setAssignmentTargets } = useSetAssignmentTargets();
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
      // Accommodated and skipped students read the window off their pointer docs.
      onWindowCleared: async (assignmentId, patch) => {
        if (!assignment || !hasStudentPointers(assignment)) return;
        await setAssignmentTargets({
          assignmentId,
          kind: 'quiz',
          sessionId: assignmentId,
          targetMode: assignment.targetMode,
          add: [],
          remove: [],
          overridesBySourcedId: {},
          window: patch,
        });
      },
    }),
    [
      pauseAssignment,
      resumeAssignment,
      deactivateAssignment,
      reopenAssignment,
      assignment,
      setAssignmentTargets,
    ]
  );
  return useAssignmentClassActions(
    assignment,
    QUIZ_COLLECTIONS,
    quizLifecycle,
    rosters
  );
}
