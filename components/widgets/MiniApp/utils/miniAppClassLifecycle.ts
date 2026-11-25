import type { UseMiniAppAssignmentsResult } from '@/hooks/useMiniAppAssignments';
import type {
  AssignmentClassCollections,
  AssignmentLifecycle,
  AssignmentRun,
} from '@/hooks/useAssignmentClassActions';
import type { UseSetAssignmentTargetsResult } from '@/hooks/useSetAssignmentTargets';
import {
  clearedWindowRule,
  syncPointerWindows,
  type StudentWindowsOption,
} from '@/utils/pointerWindowSync';

const ASSIGNMENTS = 'miniapp_assignments';

export const MINI_APP_CLASS_COLLECTIONS = {
  sessionCollection: 'mini_app_sessions',
  assignmentCollection: ASSIGNMENTS,
  refreshIdle: false,
} as const satisfies AssignmentClassCollections;

/** The whole-run writes the Assigned tab's class actions drive for one Mini App assignment. */
export interface MiniAppLifecycle extends AssignmentLifecycle {
  end: (assignmentId: string) => Promise<void>;
  /** D9: flips the row and session back to active, so the link works at once. */
  reopen: (assignmentId: string) => Promise<void>;
  isEnded: (a: Pick<AssignmentRun, 'status'>) => boolean;
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
    Pick<UseSetAssignmentTargetsResult, 'setAssignmentTargets'> &
    StudentWindowsOption
): MiniAppLifecycle {
  return {
    end: (id) => actions.endAssignment(id),
    reopen: (id) => actions.reactivateAssignment(id),
    isEnded: (a) => a.status === 'inactive',
    onWindowCleared: (id, patch) =>
      syncPointerWindows(
        actions.setAssignmentTargets,
        {
          uid,
          kind: 'mini-app',
          assignmentCollection: ASSIGNMENTS,
          assignmentId: id,
          sessionIdOnRow: true,
        },
        patch,
        actions.studentWindows ? clearedWindowRule(patch) : null
      ),
  };
}
