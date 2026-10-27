// PLC Home landing page: the team layout's cards in order, then team tools.

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import type { TeamCardId } from '@/types';
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
import {
  BLOCK_COLUMNS,
  plcHomeBlocks,
  plcHomeRows,
  type PlcHomeBlock,
} from './homeBlocks';

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
  /** Enabled cards from the team layout, in order. */
  cards: readonly TeamCardId[];
  tools: readonly PlcHomeTool[];
  strip: MeetingStripProps;
  /** The Goals card body; null hides it. */
  goal: React.ReactNode;
  /** Mastery by learning target, or the lead's tag prompt; null hides it. */
  mastery?: React.ReactNode;
  /** Latest updates; null when the Updates page is off. */
  updates?: React.ReactNode;
  /** The team calendar; null when none is attached. */
  calendar?: React.ReactNode;
  /** Undefined hides "See item analysis". */
  onOpenDataOverview?: () => void;
  onOpenAssessment: (assessmentId: string) => void;
  /** Undefined hides "All assessments". */
  onAllAssessments?: () => void;
}

const SPAN: Record<number, string> = {
  2: 'lg:col-span-2',
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
};

const EVEN: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
};

const LatestAssessment: React.FC<{
  model: DataOverviewModel;
  onOpenDataOverview?: () => void;
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
        {onOpenDataOverview && (
          <TextLink
            onClick={onOpenDataOverview}
            {...tourAttr('teams.home.see-item-analysis')}
          >
            {t('plcHome.seeItemAnalysis', {
              defaultValue: 'See item analysis',
            })}
          </TextLink>
        )}
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
  cards,
  tools,
  strip,
  goal,
  mastery = null,
  updates = null,
  calendar = null,
  onOpenDataOverview,
  onOpenAssessment,
  onAllAssessments,
}) => {
  const { t } = useTranslation();
  const on = (id: TeamCardId) => cards.includes(id);
  const homeStrip: MeetingStripProps = {
    ...strip,
    nextMeeting: on('nextMeeting') ? strip.nextMeeting : null,
    openItems: on('openItems') ? strip.openItems : null,
    revisit: on('openItems') ? strip.revisit : null,
  };
  const nodes: Record<PlcHomeBlock, React.ReactNode> = {
    strip:
      homeStrip.nextMeeting || homeStrip.openItems || homeStrip.revisit ? (
        <MeetingStripView {...homeStrip} />
      ) : null,
    distribution: model.featured ? (
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
    ),
    trend: <TrendView trend={model.trend} shortTitles={model.shortTitles} />,
    participation: (
      <ParticipationView
        rows={model.participation}
        shortTitles={model.shortTitles}
      />
    ),
    mastery,
    assessments: (
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
    ),
    goals: goal,
    updates,
    calendar,
  };
  const rows = plcHomeRows(plcHomeBlocks(cards, (b) => nodes[b] != null));
  return (
    <div className={PAGE}>
      {rows.map((row, i) => (
        <Section key={row.blocks.join('|')} first={i === 0}>
          <div
            className={`grid grid-cols-1 gap-x-10 gap-y-8 ${row.full ? 'lg:grid-cols-6' : (EVEN[row.blocks.length] ?? 'lg:grid-cols-3')}`}
          >
            {row.blocks.map((b) => (
              <div
                key={b}
                className={`min-w-0 ${row.full ? SPAN[BLOCK_COLUMNS[b]] : ''}`}
                data-home-block={b}
              >
                {nodes[b]}
              </div>
            ))}
          </div>
        </Section>
      ))}

      {tools.length > 0 && (
        <Section
          first={rows.length === 0}
          label={t('plcHome.tools', { defaultValue: 'Team tools' })}
        >
          <SectionHead
            title={t('plcHome.tools', { defaultValue: 'Team tools' })}
          />
          <ToolsRow tools={tools} />
        </Section>
      )}
    </div>
  );
};
