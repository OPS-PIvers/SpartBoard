// Outward actions in a view-as tab: disabled while read-only, confirmed and audited when unlocked (ADMIN_VIEW_AS.md D14).
import { useCallback, useContext, useMemo } from 'react';
import { DialogContext } from '@/context/DialogContextValue';
import { useViewAs } from '@/context/useViewAs';
import { recordViewAsOutward } from '@/utils/viewAsAudit';
import { openViewAsOutwardWindow } from '@/utils/viewAsTab';

export const VIEW_AS_LOCKED_TITLE = 'Unlock edits to do this';

/** Collections each confirmed outward action may write to while its window is open (D14). */
export const VIEW_AS_WRITES = {
  assign: [
    'quiz_assignments',
    'quiz_sessions',
    'quiz_join_codes',
    'video_activity_assignments',
    'video_activity_sessions',
    'guided_learning_assignments',
    'guided_learning_sessions',
    'flashcard_assignments',
    'flashcard_sessions',
    'miniapp_assignments',
    'mini_app_sessions',
    'plcs',
    'synced_quizzes',
    'synced_video_activities',
  ],
  end: [
    'quiz_assignments',
    'quiz_sessions',
    'video_activity_assignments',
    'video_activity_sessions',
    'plcs',
  ],
  shareBoard: ['shared_boards'],
  sharePlc: [
    'plcs',
    'synced_quizzes',
    'synced_video_activities',
    'synced_question_banks',
    'flashcard_assignments',
  ],
  exportSheets: ['quiz_assignments', 'plcs'],
} as const satisfies Record<string, readonly string[]>;

export interface ViewAsOutward {
  /** True in a view-as tab; callers skip confirm() otherwise so their flow stays synchronous. */
  active: boolean;
  /** True in a read-only view-as tab; the control should be disabled. */
  locked: boolean;
  /** Tooltip for a locked control, otherwise undefined. */
  lockedTitle: string | undefined;
  /** Confirms and audits the action in view-as, letting it write to `writes` collections; false when it must not run. */
  confirm: (label: string, writes?: readonly string[]) => Promise<boolean>;
  /** Audits an action whose flow already asked its own confirm. */
  audit: (label: string, writes?: readonly string[]) => void;
  /** Runs fn directly outside view-as, or after confirm() inside it. */
  run: (label: string, fn: () => void, writes?: readonly string[]) => void;
}

export function useViewAsOutward(): ViewAsOutward {
  const viewAs = useViewAs();
  const dialog = useContext(DialogContext);
  const locked = viewAs?.readOnly ?? false;
  const targetEmail = viewAs?.targetEmail;

  const confirm = useCallback(
    async (label: string, writes: readonly string[] = []): Promise<boolean> => {
      if (!viewAs) return true;
      if (viewAs.readOnly || !dialog) return false;
      const ok = await dialog.showConfirm(`As ${targetEmail}`, {
        title: label,
        confirmLabel: label,
        variant: 'warning',
      });
      if (ok) {
        openViewAsOutwardWindow(writes);
        void recordViewAsOutward(label);
      }
      return ok;
    },
    [viewAs, dialog, targetEmail]
  );

  const audit = useCallback((label: string, writes: readonly string[] = []) => {
    openViewAsOutwardWindow(writes);
    void recordViewAsOutward(label);
  }, []);

  const active = viewAs !== null;
  const run = useCallback(
    (label: string, fn: () => void, writes: readonly string[] = []) => {
      if (!active) {
        fn();
        return;
      }
      void confirm(label, writes).then((ok) => {
        if (ok) fn();
      });
    },
    [active, confirm]
  );

  return useMemo(
    () => ({
      active,
      locked,
      lockedTitle: locked ? VIEW_AS_LOCKED_TITLE : undefined,
      confirm,
      audit,
      run,
    }),
    [active, locked, confirm, audit, run]
  );
}
