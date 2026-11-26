import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TabAwayClock } from '@/components/common/TabAwayClock';
import type { TabAwayState } from '@/hooks/useTabAwayTracker';
import type { TabStrikePolicy } from '@/hooks/useTabStrikePolicy';
import type { TabAwayRule } from '@/utils/tabAwayLimit';

interface TabWarningModalProps {
  count: number;
  threshold: number | 'off';
  rule: TabAwayRule | null;
  away: TabAwayState | null;
  onDismiss: () => void;
  /** `panel` fills the nearest positioned box instead of the page. */
  layer?: 'page' | 'panel';
  /** The caller's `tourAttr(...)` for the return button. */
  dismissAttrs?: Record<string, string>;
}

/** The one tab-switch warning every student app shows. */
export const TabWarningModal: React.FC<TabWarningModalProps> = ({
  count,
  threshold,
  rule,
  away,
  onDismiss,
  layer = 'page',
  dismissAttrs,
}) => {
  const { t } = useTranslation();
  const limit = threshold === 'off' ? null : threshold;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="tab-warning-title"
      className={`${
        layer === 'page' ? 'fixed z-quiz-lock' : 'absolute z-overlay'
      } inset-0 flex flex-col items-center justify-center bg-red-900/90 p-6 text-center backdrop-blur-xs`}
    >
      <AlertCircle
        aria-hidden="true"
        className="mb-6 h-20 w-20 animate-pulse text-red-500"
      />
      <h2
        id="tab-warning-title"
        className="mb-4 text-4xl font-black text-white"
      >
        {t('studentTab.title')}
      </h2>
      {rule && away && (
        <TabAwayClock
          away={away}
          limitMs={rule.limitMs}
          autoSubmit={rule.autoSubmit}
        />
      )}
      <p className="mb-8 max-w-md text-lg text-red-200">
        {t('studentTab.body')}
        <br />
        <br />
        <strong>
          {limit === null
            ? t('studentTab.warning', { count })
            : t('studentTab.warningOf', { count, limit })}
        </strong>{' '}
        {limit !== null && t('studentTab.submits', { limit })}
      </p>
      {/* no-tour-anchor: callers pass their own anchor through dismissAttrs */}
      <button
        {...dismissAttrs}
        type="button"
        onClick={onDismiss}
        className="rounded-xl bg-white px-8 py-4 font-bold text-red-900 transition-transform active:scale-95"
      >
        {t('studentTab.return')}
      </button>
    </div>
  );
};

/** The warning for a `useTabStrikePolicy` result; renders nothing while closed. */
export const TabStrikeWarning: React.FC<{
  policy: TabStrikePolicy;
  layer?: 'page' | 'panel';
  dismissAttrs?: Record<string, string>;
}> = ({ policy, layer, dismissAttrs }) =>
  policy.warningOpen ? (
    <TabWarningModal
      count={policy.warningCount}
      threshold={policy.rules.threshold}
      rule={policy.rules.rule}
      away={policy.away}
      onDismiss={policy.dismiss}
      layer={layer}
      dismissAttrs={dismissAttrs}
    />
  ) : null;
