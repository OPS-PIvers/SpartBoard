import type { MiniAppAssignment } from '@/types';
import type { UseMiniAppAssignmentsResult } from '@/hooks/useMiniAppAssignments';

export const MINI_APP_CLASS_COLLECTIONS = {
  sessionCollection: 'mini_app_sessions',
  assignmentCollection: 'miniapp_assignments',
  refreshIdle: false,
} as const;

/** The whole-run writes the Assigned tab's class actions drive for one Mini App assignment. */
export interface MiniAppLifecycle {
  end: (assignmentId: string) => Promise<void>;
  /** D9: flips the row and session back to active, so the link works at once. */
  reopen: (assignmentId: string) => Promise<void>;
  isEnded: (a: Pick<MiniAppAssignment, 'status'>) => boolean;
}

/** Mini App submissions are whole on save, so Close has nothing to turn in and there is no run-wide pause. */
export function miniAppLifecycle(
  actions: Pick<
    UseMiniAppAssignmentsResult,
    'endAssignment' | 'reactivateAssignment'
  >
): MiniAppLifecycle {
  return {
    end: (id) => actions.endAssignment(id),
    reopen: (id) => actions.reactivateAssignment(id),
    isEnded: (a) => a.status === 'inactive',
  };
}
