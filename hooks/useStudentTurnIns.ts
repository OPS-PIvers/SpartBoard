import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyResultsOverride,
  isClosedProjectRun,
  type AssignmentSummary,
} from '@/hooks/useStudentAssignments';
import type { QuizResultsOverride } from '@/types';
import { readTurnInState, type TurnInState } from '@/utils/studentTurnIn';
import {
  OVERRIDE_KINDS,
  hasResponseDoc,
  readStudentResponseDoc,
} from '@/utils/studentResponseDoc';

/** One student's standing on one session, read from their own response doc. */
export interface TurnInCheck {
  turnIn: TurnInState;
  lockedOut: boolean;
  resultsOverride: QuizResultsOverride | null;
}

/** compositeId to check; a missing key means not checked (yet, or never for kinds without a doc). */
export type TurnInMap = Record<string, TurnInCheck>;

function toCheck(
  a: AssignmentSummary,
  data: Record<string, unknown> | null
): TurnInCheck {
  const overridable = OVERRIDE_KINDS.has(a.kind) && !!data;
  return {
    turnIn: readTurnInState(a.kind, a.flashcardKind, data),
    lockedOut: overridable && data?.resultsLockedOut === true,
    resultsOverride: overridable
      ? ((data?.resultsOverride as QuizResultsOverride | undefined) ?? null)
      : null,
  };
}

/** The teacher shared results with this student, by session publish or a per-student override. */
export function areResultsShared(
  a: AssignmentSummary,
  check: TurnInCheck | undefined,
  nowMs: number
): boolean {
  const state = OVERRIDE_KINDS.has(a.kind)
    ? applyResultsOverride(
        a.gradingState,
        check?.resultsOverride ?? null,
        nowMs
      )
    : a.gradingState;
  return state === 'graded';
}

/** Reads each assignment's response doc once per page visit (D13); resources need no check. */
export function useStudentTurnIns(
  assignments: readonly AssignmentSummary[],
  pseudonymUid: string | null
): { checks: TurnInMap; recheck: (a: AssignmentSummary) => Promise<void> } {
  const [checks, setChecks] = useState<TurnInMap>({});
  // Keyed by uid so a sign-out never carries one student's reads into another's.
  const requested = useRef<{ uid: string | null; ids: Set<string> }>({
    uid: null,
    ids: new Set(),
  });

  useEffect(() => {
    if (!pseudonymUid) return;
    if (requested.current.uid !== pseudonymUid) {
      requested.current = { uid: pseudonymUid, ids: new Set() };
    }
    const ids = requested.current.ids;
    const pending = assignments.filter(
      (a) =>
        a.workKind === 'work' &&
        !isClosedProjectRun(a) &&
        hasResponseDoc(a.kind) &&
        !ids.has(a.compositeId)
    );
    for (const a of pending) {
      ids.add(a.compositeId);
      readStudentResponseDoc(a, pseudonymUid)
        .then((data) => {
          if (requested.current.uid !== pseudonymUid) return;
          setChecks((prev) => ({ ...prev, [a.compositeId]: toCheck(a, data) }));
        })
        .catch(() => {
          // A failed read leaves the row unchecked, never Missing; a later snapshot retries it.
          ids.delete(a.compositeId);
        });
    }
  }, [assignments, pseudonymUid]);

  const recheck = useCallback(
    async (a: AssignmentSummary) => {
      if (!pseudonymUid || !hasResponseDoc(a.kind)) return;
      const data = await readStudentResponseDoc(a, pseudonymUid);
      setChecks((prev) => ({ ...prev, [a.compositeId]: toCheck(a, data) }));
    },
    [pseudonymUid]
  );

  return { checks, recheck };
}
