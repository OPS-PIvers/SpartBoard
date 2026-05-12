/**
 * usePlcLibraryActions — shared confirm/toast/busy plumbing for "unshare
 * from PLC" row actions across the Quiz Library and Video Activities
 * tiles.
 *
 * The PLC library bodies (`PlcQuizLibraryBody`, `PlcVideoActivitiesBody`)
 * already own their full unshare flow inline because their handlers
 * coexist with the heavier import/edit flows. The Overview bento tiles
 * want the same unshare UX (i18n'd confirm + toast + busy spinner) but
 * without dragging the editor handlers in. That's what this hook is for —
 * a deliberately small surface so the tile doesn't have to re-derive the
 * dialog/toast strings, and the two tiles' kebabs share a single
 * implementation.
 *
 * The hook does NOT subscribe to anything Firestore-side. It takes a
 * pre-bound `unshareFn` (from whichever PLC subcollection hook the caller
 * already uses for the row list) and layers the confirm/toast/busy
 * coordination on top.
 *
 * `kind` selects the i18n key prefix so the dialog and toast strings
 * match the existing copy on the corresponding body (quiz vs video
 * activity). Keep the prefixes in sync if either body's keys change.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { logError } from '@/utils/logError';

export type PlcLibraryActionKind = 'quiz' | 'videoActivity';

interface I18nKeySet {
  /** Confirm-dialog body (contains the {{title}} interpolation). */
  confirm: string;
  confirmDefault: string;
  /** Confirm-dialog title (no interpolation). */
  title: string;
  titleDefault: string;
  /** Confirm button label (no interpolation). */
  action: string;
  actionDefault: string;
  /** Success toast (contains {{title}}). */
  success: string;
  successDefault: string;
  /** Generic failure toast (no interpolation). */
  failure: string;
  failureDefault: string;
}

const I18N_KEYS: Record<PlcLibraryActionKind, I18nKeySet> = {
  quiz: {
    confirm: 'plcDashboard.quizLibrary.unshareConfirm',
    confirmDefault:
      'Remove "{{title}}" from this PLC? Other teammates will lose access to the shared library entry. Their personal copies (if any) keep working.',
    title: 'plcDashboard.quizLibrary.unshareTitle',
    titleDefault: 'Unshare quiz',
    action: 'plcDashboard.quizLibrary.unshareAction',
    actionDefault: 'Unshare',
    success: 'plcDashboard.quizLibrary.unshared',
    successDefault: '"{{title}}" removed from this PLC.',
    failure: 'plcDashboard.quizLibrary.unshareFailed',
    failureDefault: 'Failed to unshare quiz.',
  },
  videoActivity: {
    confirm: 'plcDashboard.videoActivities.unshareConfirm',
    confirmDefault:
      'Remove "{{title}}" from this PLC? Other teammates will lose access to the shared library entry. Their personal copies (if any) keep working.',
    title: 'plcDashboard.videoActivities.unshareTitle',
    titleDefault: 'Unshare video activity',
    action: 'plcDashboard.videoActivities.unshareAction',
    actionDefault: 'Unshare',
    success: 'plcDashboard.videoActivities.unshared',
    successDefault: '"{{title}}" removed from this PLC.',
    failure: 'plcDashboard.videoActivities.unshareFailed',
    failureDefault: 'Failed to unshare video activity.',
  },
};

export interface UsePlcLibraryActionsParams {
  /** PLC id, used only for error logging context. */
  plcId: string;
  /** Selects the i18n prefix for confirm/toast strings. */
  kind: PlcLibraryActionKind;
  /**
   * Pre-bound unshare function from `usePlcQuizzes` /
   * `usePlcVideoActivities`. The hook treats this as opaque — it does not
   * re-subscribe to the source list.
   */
  unshareFn: (itemId: string) => Promise<void>;
}

export interface UsePlcLibraryActionsResult {
  /** Show the confirm + run unshare + surface toast in one call. */
  unshare: (itemId: string, title: string) => Promise<void>;
  /** Row id currently mid-unshare (for spinner / disabled UI). */
  busyId: string | null;
}

export function usePlcLibraryActions({
  plcId,
  kind,
  unshareFn,
}: UsePlcLibraryActionsParams): UsePlcLibraryActionsResult {
  const { t } = useTranslation();
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const [busyId, setBusyId] = useState<string | null>(null);

  const unshare = useCallback(
    async (itemId: string, title: string) => {
      const keys = I18N_KEYS[kind];
      const confirmed = await showConfirm(
        t(keys.confirm, { title, defaultValue: keys.confirmDefault }),
        {
          title: t(keys.title, { defaultValue: keys.titleDefault }),
          variant: 'warning',
          confirmLabel: t(keys.action, { defaultValue: keys.actionDefault }),
        }
      );
      if (!confirmed) return;
      setBusyId(itemId);
      try {
        await unshareFn(itemId);
        addToast(
          t(keys.success, { title, defaultValue: keys.successDefault }),
          'success'
        );
      } catch (err) {
        logError(`usePlcLibraryActions.unshare.${kind}`, err, {
          plcId,
          itemId,
        });
        addToast(
          err instanceof Error
            ? err.message
            : t(keys.failure, { defaultValue: keys.failureDefault }),
          'error'
        );
      } finally {
        setBusyId(null);
      }
    },
    [addToast, kind, plcId, showConfirm, t, unshareFn]
  );

  return { unshare, busyId };
}
