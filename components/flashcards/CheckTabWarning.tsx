import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TabAwayClock } from '@/components/common/TabAwayClock';
import type { TabAwayState } from '@/hooks/useTabAwayTracker';
import type { TabAwayRule } from '@/utils/tabAwayLimit';

/** The Check's tab-switch warning, laid out like Quiz's. */
export const CheckTabWarning: React.FC<{
  count: number;
  /** Repeated switches submit the Check. */
  submits: boolean;
  away: TabAwayState | null;
  rule: TabAwayRule | null;
  onDismiss: () => void;
}> = ({ count, submits, away, rule, onDismiss }) => {
  const { t } = useTranslation();
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="check-tab-warning-title"
      className="fixed inset-0 z-overlay flex flex-col items-center justify-center bg-red-900/90 p-6 text-center backdrop-blur-xs"
    >
      <AlertCircle
        aria-hidden="true"
        className="mb-6 h-20 w-20 animate-pulse text-red-500"
      />
      <h2
        id="check-tab-warning-title"
        className="mb-4 text-4xl font-black text-white"
      >
        {t('flashcards.assignment.tabTitle')}
      </h2>
      {rule && away && (
        <TabAwayClock
          away={away}
          limitMs={rule.limitMs}
          autoSubmit={rule.autoSubmit}
        />
      )}
      <p className="mb-8 max-w-md text-lg text-red-200">
        {t('flashcards.assignment.tabBody')}
        <br />
        <br />
        <strong>{t('flashcards.assignment.tabWarning', { count })}</strong>{' '}
        {submits && t('flashcards.assignment.tabSubmits')}
      </p>
      {/* no-tour-anchor: student page; live tours run in the teacher app */}
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-xl bg-white px-8 py-4 font-bold text-red-900 transition-transform active:scale-95"
      >
        {t('flashcards.assignment.tabReturn')}
      </button>
    </div>
  );
};
