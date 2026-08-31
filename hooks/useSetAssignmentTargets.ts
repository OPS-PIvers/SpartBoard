/**
 * useSetAssignmentTargets — thin client wrapper around the `setAssignmentTargetsV1`
 * Cloud Function (M17 spec §5 A2). Every B3 consumer (quiz/VA/GL/mini-app) calls
 * this after its existing session-creation path commits, passing the payload
 * built by `buildSetAssignmentTargetsPayload` (`utils/studentTargetRef.ts`) —
 * never a hand-rolled diff.
 */

import { useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { StudentOverride, StudentTargetRef } from '@/types';

export type AssignmentTargetKind =
  | 'quiz'
  | 'video-activity'
  | 'guided-learning'
  | 'mini-app';

export interface SetAssignmentTargetsCallInput {
  assignmentId: string;
  kind: AssignmentTargetKind;
  sessionId: string;
  targetMode?: 'class' | 'students';
  add: StudentTargetRef[];
  remove: StudentTargetRef[];
  overridesBySourcedId: Record<string, StudentOverride | null>;
  window: {
    openAt?: number | null;
    closeAt?: number | null;
    dueAt?: number | null;
  };
}

export type SkipReason =
  | 'malformed-ref'
  | 'malformed-override'
  | 'not-in-teacher-classes'
  | 'test-class-not-authorized'
  | 'duplicate'
  | 'over-limit';

export interface SetAssignmentTargetsCallResult {
  written: number;
  removed: number;
  skipped: { ref: StudentTargetRef; reason: SkipReason }[];
}

export interface UseSetAssignmentTargetsResult {
  /** Calls `setAssignmentTargetsV1`; rejects on transport/permission errors. */
  setAssignmentTargets: (
    input: SetAssignmentTargetsCallInput
  ) => Promise<SetAssignmentTargetsCallResult>;
}

export function useSetAssignmentTargets(): UseSetAssignmentTargetsResult {
  const setAssignmentTargets = useCallback(
    async (
      input: SetAssignmentTargetsCallInput
    ): Promise<SetAssignmentTargetsCallResult> => {
      const callable = httpsCallable<
        SetAssignmentTargetsCallInput,
        SetAssignmentTargetsCallResult
      >(functions, 'setAssignmentTargetsV1');
      const res = await callable(input);
      return res.data;
    },
    []
  );

  return { setAssignmentTargets };
}
