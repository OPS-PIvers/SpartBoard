import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, ExternalLink, Link2, Loader2 } from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import type { GuidedLearningSaveGuard } from '@/components/widgets/GuidedLearning/utils/saveConflict';
import { TOOLS } from '@/config/tools';
import {
  canRebind,
  needsTypeToRebind,
  formatUnmappedAnchors,
  queueDisplayState,
  type QueueDisplayState,
  type TourAnchorQueueItem,
} from '@/components/tours/anchorQueue';
import {
  rebindQueueItem,
  useTourAnchorQueue,
} from '@/components/tours/anchorQueueStore';

const STATE_KEY: Record<QueueDisplayState, string> = {
  open: 'tourHealth.unmapped.status.open',
  'pr-open': 'tourHealth.unmapped.status.prOpen',
  'waiting-deploy': 'tourHealth.unmapped.status.waitingDeploy',
  mapped: 'tourHealth.unmapped.status.mapped',
  rebound: 'tourHealth.unmapped.status.rebound',
  'needs-human': 'tourHealth.unmapped.status.needsHuman',
};

const CHIP: Record<QueueDisplayState, string> = {
  open: 'bg-amber-50 text-amber-800 ring-amber-200',
  'pr-open': 'bg-sky-50 text-sky-800 ring-sky-200',
  'waiting-deploy': 'bg-sky-50 text-sky-800 ring-sky-200',
  mapped: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rebound: 'bg-slate-100 text-slate-700 ring-slate-200',
  'needs-human': 'bg-red-50 text-red-800 ring-red-200',
};

const ORDER: QueueDisplayState[] = [
  'mapped',
  'needs-human',
  'open',
  'waiting-deploy',
  'pr-open',
  'rebound',
];

const widgetLabel = (type: string | null) =>
  type ? (TOOLS.find((tool) => tool.type === type)?.label ?? type) : null;

interface UnmappedAnchorsSectionProps {
  /** Set titles by id, for the "clicked in" links. */
  titles: ReadonlyMap<string, string>;
  onOpenStep: (setId: string, stepId: string) => void;
  loadSet: (setId: string) => Promise<GuidedLearningSet | null>;
  saveSet: (
    set: GuidedLearningSet,
    guard: GuidedLearningSaveGuard
  ) => Promise<void>;
}

/** Tour Health's list of untagged recorded clicks: status, PR, where they were clicked, and Rebind. */
export const UnmappedAnchorsSection: React.FC<UnmappedAnchorsSectionProps> = ({
  titles,
  onOpenStep,
  loadSet,
  saveSet,
}) => {
  const { t } = useTranslation();
  const { items, loading, error } = useTourAnchorQueue();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const rows = items
    .map((item) => ({ item, state: queueDisplayState(item) }))
    .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
  const open = rows.filter((r) => r.state === 'open').map((r) => r.item);

  const copyAll = () => {
    void navigator.clipboard
      ?.writeText(formatUnmappedAnchors(open))
      .then(() => setCopied(true));
  };

  const rebind = async (item: TourAnchorQueueItem) => {
    setBusy(item.fingerprint);
    setFailed(null);
    try {
      await rebindQueueItem(item, { load: loadSet, save: saveSet });
    } catch (err) {
      console.error('[TourHealth] Rebind failed:', err);
      setFailed(item.fingerprint);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-labelledby="tour-health-unmapped"
      className="border border-slate-200 rounded-lg bg-white"
    >
      <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100">
        <h4
          id="tour-health-unmapped"
          className="text-sm font-semibold text-slate-900"
        >
          {t('tourHealth.unmapped.title')}
        </h4>
        <button
          type="button"
          onClick={copyAll}
          disabled={open.length === 0}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-brand-blue-primary hover:bg-slate-100 disabled:opacity-50"
        >
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          {copied
            ? t('tourHealth.unmapped.copied')
            : t('tourHealth.unmapped.copyAll')}
        </button>
      </header>

      {loading ? (
        <p className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          {t('tourHealth.loading')}
        </p>
      ) : error ? (
        <p role="alert" className="px-3 py-2 text-xs text-red-700">
          {t('tourHealth.unmapped.loadFailed')}
        </p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-500">
          {t('tourHealth.unmapped.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map(({ item, state }) => {
            const label =
              item.suggestedId ?? item.name ?? t('tourHealth.unmapped.noName');
            const meta = [
              item.role,
              item.name,
              widgetLabel(item.widgetType),
              item.pathname,
            ].filter(Boolean);
            return (
              <li
                key={item.fingerprint}
                data-testid="unmapped-item"
                className="px-3 py-2 text-xs space-y-1"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">
                    {label}
                  </code>
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${CHIP[state]}`}
                  >
                    {t(STATE_KEY[state])}
                  </span>
                  {item.anchorId && (
                    <code className="text-slate-600">{item.anchorId}</code>
                  )}
                  {item.prUrl && (
                    <a
                      href={item.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-0.5 font-semibold text-brand-blue-primary hover:underline"
                    >
                      {t('tourHealth.unmapped.pullRequest')}
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  )}
                  {canRebind(item) && (
                    <button
                      type="button"
                      onClick={() => void rebind(item)}
                      disabled={busy !== null}
                      className="ml-auto flex items-center gap-1 rounded-md bg-brand-blue-primary px-2 py-1 font-semibold text-white hover:bg-brand-blue-dark disabled:opacity-50"
                    >
                      <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                      {busy === item.fingerprint
                        ? t('tourHealth.unmapped.rebinding')
                        : t('tourHealth.unmapped.rebind', {
                            count: item.occurrences.length,
                          })}
                    </button>
                  )}
                </div>
                {meta.length > 0 && (
                  <p className="text-slate-500">{meta.join(' · ')}</p>
                )}
                {needsTypeToRebind(item) && (
                  <p className="text-amber-700">
                    {t('tourHealth.unmapped.needsType')}
                  </p>
                )}
                {state === 'needs-human' && item.reason && (
                  <p className="text-red-700">{item.reason}</p>
                )}
                {failed === item.fingerprint && (
                  <p role="alert" className="text-red-700">
                    {t('tourHealth.unmapped.rebindFailed')}
                  </p>
                )}
                {item.occurrences.length > 0 && (
                  <ul className="flex flex-wrap gap-1">
                    {item.occurrences.map((o) => {
                      const title =
                        titles.get(o.setId) ?? t('tourHealth.untitledSet');
                      return (
                        <li key={`${o.setId}/${o.stepId}`}>
                          <button
                            type="button"
                            onClick={() => onOpenStep(o.setId, o.stepId)}
                            aria-label={t('tourHealth.unmapped.openLabel', {
                              title,
                            })}
                            className="rounded-md px-1.5 py-0.5 font-semibold text-brand-blue-primary hover:bg-slate-100"
                          >
                            {title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
