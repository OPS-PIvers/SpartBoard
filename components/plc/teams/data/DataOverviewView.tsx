// PLC Data overview landing page (T18): hero, cross-assessment charts, mastery layer, recent assessments, meeting strip.

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TeamCardId } from '@/types';
import { PAGE, Section, SectionHead } from '@/components/plc/redesignMockup/ui';
import type { DataOverviewModel } from './dataOverviewModel';
import {
  DistributionView,
  MasteryView,
  MeetingStripView,
  NoResults,
  ParticipationView,
  RecentAssessmentsView,
  TagPrompt,
  TrendView,
  type MeetingStripProps,
} from './DataOverviewSections';

export interface DataOverviewViewProps {
  model: DataOverviewModel;
  isLead: boolean;
  /** Enabled landing cards from the team layout. */
  cards: readonly TeamCardId[];
  hero: React.ReactNode;
  /** The Goals card body. */
  goal: React.ReactNode;
  strip: MeetingStripProps;
  onManageTargets: () => void;
  onOpenAssessment: (assessmentId: string) => void;
  onAllAssessments: () => void;
}

const GRID_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
};

export const DataOverviewView: React.FC<DataOverviewViewProps> = ({
  model,
  isLead,
  cards,
  hero,
  goal,
  strip,
  onManageTargets,
  onOpenAssessment,
  onAllAssessments,
}) => {
  const { t } = useTranslation();
  const on = (id: TeamCardId) => cards.includes(id);
  const { featured } = model;

  const charts: React.ReactNode[] = [];
  if (on('distribution')) {
    charts.push(
      featured ? (
        <DistributionView key="dist" featured={featured} />
      ) : (
        <div key="dist" className="min-w-0">
          <SectionHead
            title={t('plcDataOverview.distribution', {
              defaultValue: 'Score distribution',
            })}
          />
          <NoResults />
        </div>
      )
    );
  }
  if (on('trend')) {
    charts.push(
      <TrendView
        key="trend"
        trend={model.trend}
        shortTitles={model.shortTitles}
      />
    );
  }
  if (on('participation')) {
    charts.push(
      <ParticipationView
        key="part"
        rows={model.participation}
        shortTitles={model.shortTitles}
      />
    );
  }

  const showMastery = on('masteryByTarget') && !!model.mastery;
  const showPrompt =
    on('masteryByTarget') && isLead && !!featured && !model.mastery;
  const showGoal = on('goals') && goal != null;
  const lower = [on('recentAssessments'), showGoal].filter(Boolean).length;
  const showStrip =
    (on('nextMeeting') && !!strip.nextMeeting) ||
    (on('openItems') && (!!strip.openItems || !!strip.revisit));

  return (
    <div className={PAGE}>
      {on('hero') && hero}

      {charts.length > 0 && (
        <Section
          first={!on('hero')}
          label={t('plcDataOverview.resultsAcross', {
            defaultValue: 'Results across assessments',
          })}
        >
          <div
            className={`grid grid-cols-1 gap-x-10 gap-y-8 ${GRID_COLS[charts.length]}`}
          >
            {charts}
          </div>
        </Section>
      )}

      {showMastery && model.mastery && (
        <Section
          label={t('plcDataOverview.mastery', {
            defaultValue: 'Mastery by learning target',
          })}
        >
          <MasteryView
            layer={model.mastery}
            isLead={isLead}
            onManageTargets={onManageTargets}
          />
        </Section>
      )}
      {showPrompt && (
        <Section
          label={t('plcDataOverview.learningTargets', {
            defaultValue: 'Learning targets',
          })}
        >
          <TagPrompt onTag={onManageTargets} />
        </Section>
      )}

      {lower > 0 && (
        <Section
          label={t('plcDataOverview.assessmentsAndGoal', {
            defaultValue: 'Assessments and goal',
          })}
        >
          <div
            className={`grid grid-cols-1 gap-x-10 gap-y-8 ${lower === 2 ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}`}
          >
            {on('recentAssessments') && (
              <RecentAssessmentsView
                rows={model.recent}
                onOpen={onOpenAssessment}
                onAll={onAllAssessments}
              />
            )}
            {showGoal && goal}
          </div>
        </Section>
      )}

      {showStrip && (
        <Section
          label={t('plcDataOverview.stripLabel', {
            defaultValue: 'Next meeting and open items',
          })}
        >
          <MeetingStripView
            {...strip}
            nextMeeting={on('nextMeeting') ? strip.nextMeeting : null}
            openItems={on('openItems') ? strip.openItems : null}
            revisit={on('openItems') ? strip.revisit : null}
          />
        </Section>
      )}
    </div>
  );
};
