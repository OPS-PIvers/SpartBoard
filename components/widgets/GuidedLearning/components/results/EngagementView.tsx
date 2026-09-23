import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import type { EngagementSummary } from '../../utils/progress';
import { StepFunnel } from './StepFunnel';
import { MisclickHeatmap } from './MisclickHeatmap';

const sectionHeading = 'text-slate-300 font-semibold uppercase tracking-wider';
const headingStyle = {
  fontSize: 'min(12px, 4.5cqmin)',
  marginBottom: 'min(8px, 2cqmin)',
};

interface Props {
  set: GuidedLearningSet;
  /** Null while the first snapshot loads. */
  summary: EngagementSummary | null;
  failed: boolean;
}

export const EngagementView: React.FC<Props> = ({ set, summary, failed }) => {
  const { t } = useTranslation();
  const body = (() => {
    if (failed) {
      return (
        <p
          className="text-slate-300"
          style={{ fontSize: 'min(12px, 4.5cqmin)' }}
        >
          {t('glEngagement.loadError')}
        </p>
      );
    }
    if (!summary) {
      return (
        <Loader2
          className="text-slate-300 animate-spin mx-auto"
          aria-hidden="true"
          style={{ width: 'min(20px, 5cqmin)', height: 'min(20px, 5cqmin)' }}
        />
      );
    }
    if (summary.viewers === 0) {
      return (
        <p
          className="text-slate-300"
          style={{ fontSize: 'min(12px, 4.5cqmin)' }}
        >
          {t('glEngagement.empty')}
        </p>
      );
    }
    return (
      <div className="flex flex-col" style={{ gap: 'min(16px, 3.5cqmin)' }}>
        <div className="grid grid-cols-2" style={{ gap: 'min(8px, 2cqmin)' }}>
          {(['watch', 'try'] as const).map((mode) => {
            const { viewers, completed } = summary.split[mode];
            return (
              <div
                key={mode}
                className="bg-white/5 rounded-xl"
                style={{ padding: 'min(12px, 2.5cqmin)' }}
                data-testid={`engagement-${mode}`}
              >
                <div
                  className="text-white font-semibold"
                  style={{ fontSize: 'min(14px, 5.5cqmin)' }}
                >
                  {t(`glEngagement.${mode}`)}
                </div>
                <div
                  className="text-slate-300 tabular-nums"
                  style={{
                    fontSize: 'min(12px, 4.5cqmin)',
                    marginTop: 'min(2px, 0.5cqmin)',
                  }}
                >
                  {t('glEngagement.viewers', { count: viewers })}
                  {viewers > 0 && (
                    <>
                      {' · '}
                      {t('glEngagement.finished', { completed, viewers })}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <h4 className={sectionHeading} style={headingStyle}>
            {t('glEngagement.funnelTitle')}
          </h4>
          <StepFunnel
            steps={set.steps}
            funnel={summary.funnel}
            viewers={summary.viewers}
          />
        </div>
        <div>
          <h4 className={sectionHeading} style={headingStyle}>
            {t('glEngagement.heatmapTitle')}
          </h4>
          <MisclickHeatmap
            set={set}
            misclicksBySlide={summary.misclicksBySlide}
          />
        </div>
      </div>
    );
  })();

  return (
    <section>
      <h3 className={sectionHeading} style={headingStyle}>
        {t('glEngagement.title')}
        {summary && summary.viewers > 0 && (
          <span className="normal-case tracking-normal font-normal">
            {' · '}
            {t('glEngagement.viewers', { count: summary.viewers })}
          </span>
        )}
      </h3>
      {body}
    </section>
  );
};
