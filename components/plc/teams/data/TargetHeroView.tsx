// Pinned learning-target hero (T5): the target's percent correct on each tagged assessment.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pin } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { MASTERY_BAR_CLASS } from '@/components/plc/home/tiles/resultsSelectors';
import type { MasteryRow } from '@/utils/plcDataOverview';
import { masteryBandFor } from '@/utils/quizTargetStats';
import type { MasteryCutoffs } from '@/utils/learningTargets';
import { ColumnChart } from '@/components/plc/redesignMockup/charts/ColumnChart';
import {
  Figure,
  META,
  Section,
  SectionHead,
} from '@/components/plc/redesignMockup/ui';
import { NoResults } from './DataOverviewSections';
import { useBandLabel, useDateFormat } from './format';

export interface TargetHeroViewProps {
  row: MasteryRow | null;
  titles: Record<string, string>;
  shortTitles: Record<string, string>;
  cutoffs: MasteryCutoffs;
  isLead: boolean;
  onChange?: () => void;
}

export const TargetHeroView: React.FC<TargetHeroViewProps> = ({
  row,
  titles,
  shortTitles,
  cutoffs,
  isLead,
  onChange,
}) => {
  const { t } = useTranslation();
  const fmt = useDateFormat();
  const bandLabel = useBandLabel();
  const heading = t('plcDataOverview.targetTrend', {
    defaultValue: 'Learning target trend',
  });
  return (
    <Section first label={heading}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold text-slate-800">
            {row ? [row.code, row.label].filter(Boolean).join(' ') : heading}
          </h2>
          <p className={`${META} mt-1 flex flex-wrap items-center gap-1`}>
            {heading} ·
            <Pin className="h-3 w-3" aria-hidden="true" />
            {t('plcDataOverview.pinned', { defaultValue: 'Pinned' })}
          </p>
        </div>
        {isLead && onChange && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Pin className="h-3.5 w-3.5" aria-hidden="true" />}
            title={t('plcDataOverview.changeTitle', {
              defaultValue: 'Change what the team sees first',
            })}
            onClick={onChange}
          >
            {t('plcDataOverview.change', { defaultValue: 'Change' })}
          </Button>
        )}
      </div>
      {!row || row.points.length === 0 ? (
        <div className="mt-5">
          <NoResults />
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-x-12 gap-y-4">
            <Figure
              value={`${row.correctPercent ?? 0}%`}
              label={t('plcDataOverview.legend.correct', {
                defaultValue: 'Correct',
              })}
            />
            {row.band && (
              <Figure
                value={bandLabel(row.band)}
                label={t('plcDataOverview.col.band', { defaultValue: 'Band' })}
              />
            )}
          </div>
          <div className="mt-6">
            <SectionHead title={heading} />
            <ColumnChart
              ariaLabel={heading}
              yMax={100}
              yTicks={[0, 50, 100]}
              yUnit="%"
              maxBarWidth={40}
              columns={row.points.map((p) => {
                const title = titles[p.assessmentId] ?? p.assessmentId;
                const pointBand = p.lowSample
                  ? null
                  : masteryBandFor(p.correctPercent, cutoffs);
                const band = bandLabel(pointBand);
                return {
                  key: p.assessmentId,
                  x: shortTitles[p.assessmentId] ?? title,
                  value: p.correctPercent,
                  label: `${p.correctPercent}%`,
                  bg: pointBand ? MASTERY_BAR_CLASS[pointBand] : 'bg-slate-300',
                  ariaLabel: `${title}, ${p.correctPercent}%`,
                  tip: {
                    heading: `${title} · ${fmt(p.date)}`,
                    rows: [
                      {
                        value: `${p.correctPercent}%`,
                        label: band
                          ? t('plcDataOverview.tip.correctBand', {
                              band: band.toLowerCase(),
                              defaultValue: 'correct, {{band}}',
                            })
                          : t('plcDataOverview.legend.correct', {
                              defaultValue: 'Correct',
                            }),
                      },
                    ],
                  },
                };
              })}
            />
          </div>
        </>
      )}
    </Section>
  );
};
