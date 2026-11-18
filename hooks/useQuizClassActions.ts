import { useMemo } from 'react';
import {
  deleteField,
  doc,
  FieldPath,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ClassRoster, QuizAssignment, StudentOverride } from '@/types';
import {
  useAssignmentClassActions,
  type AssignmentClassActions,
  type AssignmentLifecycle,
} from '@/hooks/useAssignmentClassActions';
import { useSetAssignmentTargets } from '@/hooks/useSetAssignmentTargets';
import {
  hasStudentPointers,
  studentTargetRefKey,
} from '@/utils/studentTargetRef';
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

/** Per-student window shifts that would still hold a student out once Open clears the class window; null clears the override. */
export function staleWindowOverrides(
  assignment: Pick<QuizAssignment, 'overridesBySourcedId' | 'targetStudents'>,
  patch: { openAt?: null; closeAt?: null },
  now: number
): Record<string, StudentOverride | null> {
  const targeted = new Set(
    (assignment.targetStudents ?? []).map(studentTargetRefKey)
  );
  const out: Record<string, StudentOverride | null> = {};
  for (const [key, override] of Object.entries(
    assignment.overridesBySourcedId ?? {}
  )) {
    if (!targeted.has(key) || !override) continue;
    const next: StudentOverride = { ...override };
    // Once the class close is gone, any per-student close (even one not yet reached) would cut that student off alone.
    if ('closeAt' in patch) delete next.closeAt;
    if (
      'openAt' in patch &&
      typeof next.openAt === 'number' &&
      next.openAt > now
    )
      delete next.openAt;
    if (next.closeAt === override.closeAt && next.openAt === override.openAt)
      continue;
    out[key] = Object.keys(next).length > 0 ? next : null;
  }
  return out;
}

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
        // A failed pointer sync must not stop Open from letting the class in.
        try {
          const ref = doc(
            db,
            'users',
            assignment.teacherUid,
            'quiz_assignments',
            assignmentId
          );
          const stored = (await getDoc(ref)).data() as
            QuizAssignment | undefined;
          // An expired extra-time close (or a later start) would still win over the cleared class window.
          const stale = staleWindowOverrides(
            stored ?? assignment,
            patch,
            Date.now()
          );
          await setAssignmentTargets({
            assignmentId,
            kind: 'quiz',
            sessionId: assignmentId,
            targetMode: assignment.targetMode,
            add: [],
            remove: [],
            overridesBySourcedId: stale,
            window: patch,
          });
          const fields = Object.entries(stale).flatMap(([key, value]) => [
            new FieldPath('overridesBySourcedId', key),
            value ?? deleteField(),
          ]);
          if (fields.length > 0) {
            const [first, firstValue, ...rest] = fields;
            await updateDoc(ref, first as FieldPath, firstValue, ...rest);
          }
        } catch (err) {
          console.error('Pointer window sync failed', err);
        }
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
