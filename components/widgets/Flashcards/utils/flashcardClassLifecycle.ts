import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { FlashcardAssignment } from '@/types';
import type { UseFlashcardAssignmentsResult } from '@/hooks/useFlashcardAssignments';
import type {
  AssignmentClassCollections,
  AssignmentLifecycle,
} from '@/hooks/useAssignmentClassActions';
import type { UseSetAssignmentTargetsResult } from '@/hooks/useSetAssignmentTargets';
import { hasStudentPointers } from '@/utils/studentTargetRef';

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
    Pick<UseSetAssignmentTargetsResult, 'setAssignmentTargets'>
): FlashcardLifecycle {
  return {
    end: (id) => actions.endAssignment(id),
    reopen: (id) => actions.reopenAssignment(id),
    async onWindowCleared(id, patch) {
      const row = (
        await getDoc(doc(db, 'users', uid, ASSIGNMENTS, id))
      ).data() as FlashcardAssignment | undefined;
      if (!row || !hasStudentPointers(row)) return;
      // A failed pointer sync must not stop Open from letting the class in.
      try {
        await actions.setAssignmentTargets({
          assignmentId: id,
          kind: 'flashcards',
          sessionId: row.sessionId,
          targetMode: row.targetMode,
          add: [],
          remove: [],
          overridesBySourcedId: {},
          window: patch,
        });
      } catch (err) {
        console.error('Pointer window sync failed', err);
      }
    },
  };
}
