import type { UseFlashcardAssignmentsResult } from '@/hooks/useFlashcardAssignments';
import type {
  AssignmentClassCollections,
  AssignmentLifecycle,
} from '@/hooks/useAssignmentClassActions';
import type { UseSetAssignmentTargetsResult } from '@/hooks/useSetAssignmentTargets';
import {
  clearedWindowRule,
  syncPointerWindows,
  type StudentWindowsOption,
} from '@/utils/pointerWindowSync';

const ASSIGNMENTS = 'flashcard_assignments';

export const FLASHCARD_CLASS_COLLECTIONS = {
  sessionCollection: 'flashcard_sessions',
  assignmentCollection: ASSIGNMENTS,
  refreshIdle: false,
} as const satisfies AssignmentClassCollections;

/** The whole-run writes the Assigned tab's class actions drive for one Flashcards assignment. */
export interface FlashcardLifecycle extends AssignmentLifecycle {
  end: (assignmentId: string) => Promise<void>;
  /** D9: an ended run comes back active at once. */
  reopen: (assignmentId: string) => Promise<void>;
  onWindowCleared: (
    assignmentId: string,
    patch: { openAt?: null; closeAt?: null }
  ) => Promise<void>;
}

/** Flashcards has no run-wide pause, and a Check submits on the server, so Close has nothing to turn in. */
export function flashcardLifecycle(
  uid: string,
  actions: Pick<
    UseFlashcardAssignmentsResult,
    'endAssignment' | 'reopenAssignment'
  > &
    Pick<UseSetAssignmentTargetsResult, 'setAssignmentTargets'> &
    StudentWindowsOption
): FlashcardLifecycle {
  return {
    end: (id) => actions.endAssignment(id),
    reopen: (id) => actions.reopenAssignment(id),
    onWindowCleared: (id, patch) =>
      syncPointerWindows(
        actions.setAssignmentTargets,
        {
          uid,
          kind: 'flashcards',
          assignmentCollection: ASSIGNMENTS,
          assignmentId: id,
          sessionIdOnRow: true,
        },
        patch,
        actions.studentWindows ? clearedWindowRule(patch) : null
      ),
  };
}
