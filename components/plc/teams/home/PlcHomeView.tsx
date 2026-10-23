// PLC Home landing page: results over time, a latest-assessment preview, team tools and the meeting strip.

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  Figure,
  META,
  PAGE,
  Section,
  SectionHead,
  TextLink,
} from '@/components/plc/redesignMockup/ui';
import type { DataOverviewModel } from '@/components/plc/teams/data/dataOverviewModel';
import {
  DistributionView,
  MeetingStripView,
  NoResults,
  ParticipationView,
  RecentAssessmentsView,
  TrendView,
  type MeetingStripProps,
} from '@/components/plc/teams/data/DataOverviewSections';
import { useDateFormat } from '@/components/plc/teams/data/format';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export interface PlcHomeTool {
  id: string;
  label: string;
  icon: LucideIcon;
  /** One line under the label, e.g. "12 assessments". */
  meta: string;
  onOpen: () => void;
}

export interface PlcHomeViewProps {
  model: DataOverviewModel;
  tools: readonly PlcHomeTool[];
  strip: MeetingStripProps;
  /** The Goals card body; null hides it. */
  goal: React.ReactNode;
  onOpenDataOverview: () => void;
  onOpenAssessment: (assessmentId: string) => void;
  onAllAssessments: () => void;
}

const LatestAssessment: React.FC<{
  model: DataOverviewModel;
  onOpenDataOverview: () => void;
  onOpenAssessment: (assessmentId: string) => void;
}> = ({ model, onOpenDataOverview, onOpenAssessment }) => {
  const { t } = useTranslation();
  const fmt = useDateFormat();
  const featured = model.featured;
  if (!featured) return <NoResults />;
  const { headline } = featured.itemAnalysis;
  const p = headline.participation;
  return (
    <div className="min-w-0">
      <SectionHead
        title={t('plcHome.latest', { defaultValue: 'Latest assessment' })}
      >
        <TextLink
          onClick={onOpenDataOverview}
          {...tourAttr('teams.home.see-item-analysis')}
        >
          {t('plcHome.seeItemAnalysis', {
            defaultValue: 'See item analysis',
          })}
        </TextLink>
      </SectionHead>
      <button
        type="button"
        {...tourAttr('teams.home.latest-assessment')}
        onClick={() => onOpenAssessment(featured.assessmentId)}
        className="block text-left text-base font-bold text-slate-800 hover:text-brand-blue-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
      >
        {featured.title}
      </button>
      <p className={`${META} mt-0.5`}>
        {t('plcDataOverview.heroMeta', {
          date: fmt(featured.date),
          count: featured.questionCount,
          defaultValue:
            'Common assessment · closed {{date}} · {{count}} questions',
        })}
      </p>
      <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
        <Figure
          value={
            headline.teamAveragePercent === null
              ? '·'
              : `${headline.teamAveragePercent}%`
          }
          label={t('plcDataOverview.teamAverage', {
            defaultValue: 'Team average',
          })}
        />
        {p.scoredStudents !== null && (
          <Figure
            value={`${p.percent ?? 0}%`}
            label={t('plcDataOverview.participation', {
              defaultValue: 'Participation',
            })}
          />
        )}
        <Figure
          value={featured.itemAnalysis.reteachCount}
          label={t('plcDataOverview.toReteach', {
            defaultValue: 'Questions to reteach',
          })}
        />
      </div>
    </div>
  );
};

const ToolsRow: React.FC<{ tools: readonly PlcHomeTool[] }> = ({ tools }) => (
  <ul className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
    {tools.map(({ id, label, icon: Icon, meta, onOpen }) => (
      <li key={id} className="min-w-0">
        <button
          type="button"
          onClick={onOpen}
          {...tourFieldAttr('teams.home.tool', 'teams-home', id)}
          className="group flex w-full min-w-0 items-start gap-3 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
        >
          <Icon
            className="mt-0.5 h-5 w-5 shrink-0 text-slate-400 group-hover:text-brand-blue-primary"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-800 group-hover:text-brand-blue-primary">
              {label}
            </span>
            <span className={`${META} block truncate`}>{meta}</span>
          </span>
        </button>
      </li>
    ))}
  </ul>
);

export const PlcHomeView: React.FC<PlcHomeViewProps> = ({
  model,
  tools,
  strip,
  goal,
  onOpenDataOverview,
  onOpenAssessment,
  onAllAssessments,
}) => {
  const { t } = useTranslation();
  const showStrip = !!strip.nextMeeting || !!strip.openItems || !!strip.revisit;
  return (
    <div className={PAGE}>
      {showStrip && (
        <Section first>
          <MeetingStripView {...strip} />
        </Section>
      )}

      <Section
        first={!showStrip}
        label={t('plcDataOverview.resultsAcross', {
          defaultValue: 'Results across assessments',
        })}
      >
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-3">
          {model.featured ? (
            <DistributionView featured={model.featured} />
          ) : (
            <div className="min-w-0">
              <SectionHead
                title={t('plcDataOverview.distribution', {
                  defaultValue: 'Score distribution',
                })}
              />
              <NoResults />
            </div>
          )}
          <TrendView trend={model.trend} shortTitles={model.shortTitles} />
          <ParticipationView
            rows={model.participation}
            shortTitles={model.shortTitles}
          />
        </div>
      </Section>

      <Section
        label={t('plcHome.latestAndRecent', {
          defaultValue: 'Latest and recent assessments',
        })}
      >
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <LatestAssessment
            model={model}
            onOpenDataOverview={onOpenDataOverview}
            onOpenAssessment={onOpenAssessment}
          />
          <RecentAssessmentsView
            rows={model.recent}
            onOpen={onOpenAssessment}
            onAll={onAllAssessments}
          />
        </div>
      </Section>

      <Section label={t('plcHome.tools', { defaultValue: 'Team tools' })}>
        <SectionHead
          title={t('plcHome.tools', { defaultValue: 'Team tools' })}
        />
        <ToolsRow tools={tools} />
      </Section>

      {goal != null && (
        <Section label={t('plcDataOverview.goal', { defaultValue: 'Goal' })}>
          {goal}
        </Section>
      )}
    </div>
  );
};
