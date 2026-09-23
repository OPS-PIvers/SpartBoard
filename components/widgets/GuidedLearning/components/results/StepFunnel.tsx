import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GuidedLearningStep } from '@/types';
import type { EngagementSummary } from '../../utils/progress';
import { formatStepDuration } from './formatStepDuration';

interface Props {
  steps: GuidedLearningStep[];
  funnel: EngagementSummary['funnel'];
  viewers: number;
}

/** One bar per step: how many viewers reached it, with the median time spent there. */
export const StepFunnel: React.FC<Props> = ({ steps, funnel, viewers }) => {
  const { t } = useTranslation();
  const labels = new Map(
    steps.map((s, i) => [
      s.id,
      s.label?.trim()
        ? s.label.trim()
        : t('glEngagement.stepFallback', { number: i + 1 }),
    ])
  );
  return (
    <ol className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
      {funnel.map((row, idx) => {
        const pct = viewers > 0 ? Math.round((row.reached / viewers) * 100) : 0;
        return (
          <li
            key={row.stepId}
            className="bg-white/5 rounded-lg"
            style={{ padding: 'min(8px, 2cqmin) min(12px, 2.5cqmin)' }}
          >
            <div
              className="flex items-baseline justify-between"
              style={{
                gap: 'min(8px, 2cqmin)',
                fontSize: 'min(12px, 4.5cqmin)',
              }}
            >
              <span className="text-white font-medium truncate">
                {idx + 1}. {labels.get(row.stepId)}
              </span>
              <span className="text-slate-300 shrink-0 tabular-nums">
                {t('glEngagement.reached', {
                  reached: row.reached,
                  total: viewers,
                })}
                {row.medianMs !== null && (
                  <>
                    {' · '}
                    {t('glEngagement.medianTime', {
                      time: formatStepDuration(row.medianMs, t),
                    })}
                  </>
                )}
              </span>
            </div>
            <div
              className="bg-slate-700 rounded-full overflow-hidden"
              style={{
                height: 'min(6px, 1.5cqmin)',
                marginTop: 'min(6px, 1.5cqmin)',
              }}
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-indigo-400"
                style={{ width: `${pct}%` }}
                data-testid="funnel-bar"
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
};
