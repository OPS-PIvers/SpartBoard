// Confirm, busy row and error toast for unsharing any PLC library row; the caller passes the kind's unshare.
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { logError } from '@/utils/logError';
import type { PlcLibraryKind } from '@/hooks/usePlcLibraryEntries';

export type PlcLibraryActionKind = PlcLibraryKind;

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
  /** Success toast (contains {{title}}); omitted when the caller's flow toasts itself. */
  success?: string;
  successDefault?: string;
  /** Generic failure toast (no interpolation). */
  failure: string;
  failureDefault: string;
  /** Show the thrown error's message instead of the generic failure. */
  errorMessageFirst?: boolean;
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
    errorMessageFirst: true,
  },
  videoActivity: {
    confirm: 'plcDashboard.videoActivities.groupUnshareConfirm',
    confirmDefault:
      'Remove "{{title}}" from this group? Other teammates will lose access to the shared library entry. Their personal copies (if any) keep working.',
    title: 'plcDashboard.videoActivities.unshareTitle',
    titleDefault: 'Unshare video activity',
    action: 'plcDashboard.videoActivities.unshareAction',
    actionDefault: 'Unshare',
    failure: 'plcDashboard.videoActivities.unshareFailed',
    failureDefault: 'Failed to unshare video activity.',
    errorMessageFirst: true,
  },
  rubric: {
    confirm: 'plcDashboard.rubricLibrary.groupUnshareConfirm',
    confirmDefault:
      'Remove "{{title}}" from this group? Teammates lose access to the shared entry; copies already in their libraries keep working.',
    title: 'plcDashboard.rubricLibrary.unshareTitle',
    titleDefault: 'Unshare rubric',
    action: 'plcDashboard.rubricLibrary.unshareAction',
    actionDefault: 'Unshare',
    failure: 'plcDashboard.rubricLibrary.unshareFailed',
    failureDefault: 'Failed to unshare rubric.',
  },
  flashcards: {
    confirm: 'plcDashboard.flashcards.groupUnshareConfirm',
    confirmDefault: 'Remove "{{title}}" from this group?',
    title: 'plcDashboard.flashcards.unshareTitle',
    titleDefault: 'Unshare set',
    action: 'plcDashboard.flashcards.unshare',
    actionDefault: 'Unshare',
    failure: 'plcDashboard.flashcards.unshareFailed',
    failureDefault: 'Could not unshare the set.',
  },
  questionBank: {
    confirm: 'plcDashboard.bankLibrary.groupUnshareConfirm',
    confirmDefault:
      'Stop sharing "{{title}}" with this group? Teammates’ quizzes that draw from it will stop resolving; copies in their libraries keep working.',
    title: 'plcDashboard.bankLibrary.unshareTitle',
    titleDefault: 'Stop sharing bank',
    action: 'plcDashboard.bankLibrary.unshareAction',
    actionDefault: 'Stop sharing',
    failure: 'plcDashboard.bankLibrary.unshareFailed',
    failureDefault: 'Failed to stop sharing question bank.',
  },
};

export interface UsePlcLibraryActionsParams {
  /** PLC id, used only for error logging context. */
  plcId: string;
  /** Selects the i18n prefix for confirm/toast strings. */
  kind: PlcLibraryActionKind;
  /** The kind's unshare (usually `usePlcLibraryEntries().unshare`, or a flow wrapping it). */
  unshareFn: (itemId: string, title: string) => Promise<void>;
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
        await unshareFn(itemId, title);
        if (keys.success) {
          addToast(
            t(keys.success, { title, defaultValue: keys.successDefault }),
            'success'
          );
        }
      } catch (err) {
        logError(`usePlcLibraryActions.unshare.${kind}`, err, {
          plcId,
          itemId,
        });
        addToast(
          keys.errorMessageFirst && err instanceof Error
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
