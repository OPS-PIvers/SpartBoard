// Outward actions in a view-as tab: disabled while read-only, confirmed and audited when unlocked (ADMIN_VIEW_AS.md D14).
import { useCallback, useContext, useMemo } from 'react';
import { DialogContext } from '@/context/DialogContextValue';
import { useViewAs } from '@/context/useViewAs';
import { recordViewAsOutward } from '@/utils/viewAsAudit';

export const VIEW_AS_LOCKED_TITLE = 'Unlock edits to do this';

export interface ViewAsOutward {
  /** True in a view-as tab; callers skip confirm() otherwise so their flow stays synchronous. */
  active: boolean;
  /** True in a read-only view-as tab; the control should be disabled. */
  locked: boolean;
  /** Tooltip for a locked control, otherwise undefined. */
  lockedTitle: string | undefined;
  /** Confirms and audits the action in view-as; true outside view-as, false when it must not run. */
  confirm: (label: string) => Promise<boolean>;
  /** Audits an action whose flow already asked its own confirm. */
  audit: (label: string) => void;
  /** Runs fn directly outside view-as, or after confirm() inside it. */
  run: (label: string, fn: () => void) => void;
}

export function useViewAsOutward(): ViewAsOutward {
  const viewAs = useViewAs();
  const dialog = useContext(DialogContext);
  const locked = viewAs?.readOnly ?? false;
  const targetEmail = viewAs?.targetEmail;

  const confirm = useCallback(
    async (label: string): Promise<boolean> => {
      if (!viewAs) return true;
      if (viewAs.readOnly || !dialog) return false;
      const ok = await dialog.showConfirm(`As ${targetEmail}`, {
        title: label,
        confirmLabel: label,
        variant: 'warning',
      });
      if (ok) void recordViewAsOutward(label);
      return ok;
    },
    [viewAs, dialog, targetEmail]
  );

  const audit = useCallback((label: string) => {
    void recordViewAsOutward(label);
  }, []);

  const active = viewAs !== null;
  const run = useCallback(
    (label: string, fn: () => void) => {
      if (!active) {
        fn();
        return;
      }
      void confirm(label).then((ok) => {
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
