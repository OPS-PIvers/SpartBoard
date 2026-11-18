import { useCallback, useMemo } from 'react';
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

/** Which per-student window shifts to drop: every close, only expired closes, and starts still ahead. */
export interface StaleWindowRule {
  closeAt: 'all' | 'expired' | 'keep';
  futureOpenAt: boolean;
}

/** Per-student window shifts that would still hold a student out once the teacher opens the quiz; null clears the override. */
export function staleWindowOverrides(
  assignment: Pick<QuizAssignment, 'overridesBySourcedId' | 'targetStudents'>,
  rule: StaleWindowRule,
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
    const close = next.closeAt;
    if (
      typeof close === 'number' &&
      (rule.closeAt === 'all' || (rule.closeAt === 'expired' && close <= now))
    )
      delete next.closeAt;
    if (
      rule.futureOpenAt &&
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
  // Accommodated and skipped students read the window off their pointer docs.
  const syncStudentWindows = useCallback(
    async (
      assignmentId: string,
      patch: { openAt?: null; closeAt?: null } | null,
      rule: StaleWindowRule
    ) => {
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
        const stored = (await getDoc(ref)).data() as QuizAssignment | undefined;
        const stale = staleWindowOverrides(
          stored ?? assignment,
          rule,
          Date.now()
        );
        if (!patch && Object.keys(stale).length === 0) return;
        const call = (
          overridesBySourcedId: Record<string, StudentOverride | null>,
          window: { openAt?: null; closeAt?: null }
        ) =>
          setAssignmentTargets({
            assignmentId,
            kind: 'quiz',
            sessionId: assignmentId,
            targetMode: assignment.targetMode,
            add: [],
            remove: [],
            overridesBySourcedId,
            window,
          });
        const skippedKeys = (result: Awaited<ReturnType<typeof call>>) =>
          new Set(
            (result?.skipped ?? [])
              .filter((s) => s.reason === 'malformed-override')
              .map((s) => studentTargetRefKey(s.ref))
          );
        let missed = skippedKeys(await call(stale, patch ?? {}));
        // An override left with nothing the server keeps is cleared outright, so its old close can't win.
        if (missed.size > 0)
          missed = skippedKeys(
            await call(
              Object.fromEntries([...missed].map((key) => [key, null])),
              {}
            )
          );
        // Mirror only what reached the pointers, so a later Open still sees the rest as stale.
        const applied = Object.entries(stale).filter(
          ([key]) => !missed.has(key)
        );
        const fields = applied.flatMap(([key, value]) => [
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
      // Once the class close is gone, any per-student close (even one not yet reached) would cut that student off alone.
      onWindowCleared: (assignmentId, patch) =>
        syncStudentWindows(assignmentId, patch, {
          closeAt: 'closeAt' in patch ? 'all' : 'keep',
          futureOpenAt: 'openAt' in patch,
        }),
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
    ]
  );
  return useAssignmentClassActions(
    assignment,
    QUIZ_COLLECTIONS,
    quizLifecycle,
    rosters
  );
}
