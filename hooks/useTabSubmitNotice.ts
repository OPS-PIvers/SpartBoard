import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialog } from '@/context/useDialog';
import type { TabAutoSubmitReason } from '@/hooks/useTabStrikePolicy';

const MESSAGE_KEY: Record<TabAutoSubmitReason, string> = {
  strikes: 'studentTab.strikes',
  'post-unlock': 'studentTab.unlocked',
  away: 'studentTab.awayTooLong',
};

/** The notice after a tab-switch auto-submit, shown once the work is in. */
export function useTabSubmitNotice(): (
  reason: TabAutoSubmitReason
) => Promise<void> {
  const { t } = useTranslation();
  const { showAlert } = useDialog();
  return useCallback(
    (reason) =>
      showAlert(t(MESSAGE_KEY[reason]), {
        title: t('studentTab.submittedTitle'),
        variant: 'warning',
      }),
    [showAlert, t]
  );
}
