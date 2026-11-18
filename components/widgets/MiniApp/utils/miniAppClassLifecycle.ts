import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { MiniAppAssignment } from '@/types';
import type { UseMiniAppAssignmentsResult } from '@/hooks/useMiniAppAssignments';
import type { UseSetAssignmentTargetsResult } from '@/hooks/useSetAssignmentTargets';
import { hasStudentPointers } from '@/utils/studentTargetRef';

const ASSIGNMENTS = 'miniapp_assignments';

export const MINI_APP_CLASS_COLLECTIONS = {
  sessionCollection: 'mini_app_sessions',
  assignmentCollection: ASSIGNMENTS,
  refreshIdle: false,
} as const;

/** The whole-run writes the Assigned tab's class actions drive for one Mini App assignment. */
export interface MiniAppLifecycle {
  end: (assignmentId: string) => Promise<void>;
  /** D9: flips the row and session back to active, so the link works at once. */
  reopen: (assignmentId: string) => Promise<void>;
  isEnded: (a: Pick<MiniAppAssignment, 'status'>) => boolean;
  /** Keeps each targeted student's own pointer window in step with a cleared run window. */
  onWindowCleared: (
    assignmentId: string,
    patch: { openAt?: null; closeAt?: null }
  ) => Promise<void>;
}

/** Mini App submissions are whole on save, so Close has nothing to turn in and there is no run-wide pause. */
export function miniAppLifecycle(
  uid: string,
  actions: Pick<
    UseMiniAppAssignmentsResult,
    'endAssignment' | 'reactivateAssignment'
  > &
    Pick<UseSetAssignmentTargetsResult, 'setAssignmentTargets'>
): MiniAppLifecycle {
  return {
    end: (id) => actions.endAssignment(id),
    reopen: (id) => actions.reactivateAssignment(id),
    isEnded: (a) => a.status === 'inactive',
    async onWindowCleared(id, patch) {
      const row = (
        await getDoc(doc(db, 'users', uid, ASSIGNMENTS, id))
      ).data() as MiniAppAssignment | undefined;
      if (!row || !hasStudentPointers(row)) return;
      await actions.setAssignmentTargets({
        assignmentId: id,
        kind: 'mini-app',
        sessionId: row.sessionId,
        targetMode: row.targetMode,
        add: [],
        remove: [],
        overridesBySourcedId: {},
        window: patch,
      });
    },
  };
}
