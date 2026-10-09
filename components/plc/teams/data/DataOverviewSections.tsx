// Props-driven sections of the PLC Data overview (T18, T19), drawn with the mockup's SVG chart kit (T20).

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  CheckSquare,
  Clock,
  Pin,
  Scale,
  Target,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { SCORE_DISTRIBUTION_BANDS } from '@/utils/scoreColor';
import { MASTERY_BAR_CLASS } from '@/components/plc/home/tiles/resultsSelectors';
import type { ParticipationRow, TeamTrendPoint } from '@/utils/plcDataOverview';
import { BarRows } from '@/components/plc/redesignMockup/charts/BarRows';
import { ColumnChart } from '@/components/plc/redesignMockup/charts/ColumnChart';
import {
  DataTable,
  TableToggle,
} from '@/components/plc/redesignMockup/charts/DataTable';
import { ChartLegend } from '@/components/plc/redesignMockup/charts/ChartTooltip';
import { TrendLine } from '@/components/plc/redesignMockup/charts/TrendLine';
import {
  Figure,
  MenuSelect,
  META,
  Section,
  SectionHead,
  TextLink,
} from '@/components/plc/redesignMockup/ui';
import type {
  FeaturedAssessment,
  MasteryLayer,
  RecentAssessmentRow,
} from './dataOverviewModel';
import { ITEM_COLUMNS, buildItemRows, itemLegend } from './itemAnalysisRows';
import { useBandLabel, useDateFormat } from './format';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

const COMPACT_QUESTIONS = 8;

const useToggle = () => {
  const [on, setOn] = useState(false);
  return [on, () => setOn((v) => !v)] as const;
};

/** Empty line for a hero or card with no scored data yet. */
export const NoResults: React.FC = () => {
  const { t } = useTranslation();
  return (
    <p className="text-sm text-slate-500">
      {t('plcDashboard.assessmentDetail.noQuestions', {
        defaultValue: 'No results yet.',
      })}
    </p>
  );
};

export interface AssessmentHeroViewProps {
  featured: FeaturedAssessment;
  newer: { title: string; date: number } | null;
  isLead: boolean;
  /** Opens the layout editor's hero picker; hidden when absent. */
  onChange?: () => void;
  onOpenResults: () => void;
  onShowLatest?: () => void;
  /** Name of whoever pinned this hero. */
  pinnedBy?: string;
}

/** T19 item-analysis hero: headline numbers, then percent correct per question with the dominant wrong answer. */
export const AssessmentHeroView: React.FC<AssessmentHeroViewProps> = ({
  featured,
  newer,
  isLead,
  onChange,
  onOpenResults,
  onShowLatest,
  pinnedBy,
}) => {
  const { t } = useTranslation();
  const fmt = useDateFormat();
  const [sort, setSort] = useState<'low' | 'order'>('low');
  const [showAll, setShowAll] = useState(false);
  const [nudge, setNudge] = useState(true);
  const [table, toggleTable] = useToggle();
  const ia = featured.itemAnalysis;
  const ordered = useMemo(
    () =>
      sort === 'low'
        ? ia.questions
        : [...ia.questions].sort((a, b) => a.number - b.number),
    [ia.questions, sort]
  );
  const shown = showAll ? ordered : ordered.slice(0, COMPACT_QUESTIONS);
  const p = ia.headline.participation;
  const tagged = Object.keys(featured.targetOf).length > 0;
  return (
    <Section
      first
      label={t('plcDataOverview.featured', {
        defaultValue: 'Featured assessment',
      })}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold text-slate-800">
            {featured.title}
          </h2>
          <p className={`${META} mt-1 flex flex-wrap items-center gap-1`}>
            {t('plcDataOverview.heroMeta', {
              date: fmt(featured.date),
              count: featured.questionCount,
              defaultValue:
                'Common assessment · closed {{date}} · {{count}} questions',
            })}
            {featured.pinned && (
              <>
                {' ·'}
                <Pin className="h-3 w-3" aria-hidden="true" />
                {pinnedBy
                  ? t('plcDataOverview.pinnedBy', {
                      name: pinnedBy,
                      defaultValue: 'Pinned by {{name}}',
                    })
                  : t('plcDataOverview.pinned', { defaultValue: 'Pinned' })}
              </>
            )}
          </p>
          {isLead && newer && nudge && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Clock
                  className="h-3.5 w-3.5 text-slate-400"
                  aria-hidden="true"
                />
                {t('plcDataOverview.newer', {
                  title: newer.title,
                  date: fmt(newer.date),
                  defaultValue: 'Newer results: {{title}}, {{date}}.',
                })}
              </span>
              {onShowLatest && (
                <TextLink
                  onClick={onShowLatest}
                  {...tourAttr('teams.hero.show-latest')}
                >
                  {t('plcDataOverview.showLatest', {
                    defaultValue: 'Show latest',
                  })}
                </TextLink>
              )}
              <TextLink
                quiet
                onClick={() => setNudge(false)}
                {...tourAttr('teams.hero.keep-pinned')}
              >
                {t('plcDataOverview.keepPinned', {
                  defaultValue: 'Keep pinned',
                })}
              </TextLink>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLead && onChange && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Pin className="h-3.5 w-3.5" aria-hidden="true" />}
              title={t('plcDataOverview.changeTitle', {
                defaultValue: 'Change what the team sees first',
              })}
              {...tourAttr('teams.hero.change')}
              onClick={onChange}
            >
              {t('plcDataOverview.change', { defaultValue: 'Change' })}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenResults}
            {...tourAttr('teams.data.open-results')}
          >
            {t('plcDataOverview.openResults', {
              defaultValue: 'Open results',
            })}
          </Button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-12 gap-y-4">
        <Figure
          value={
            ia.headline.teamAveragePercent === null
              ? '·'
              : `${ia.headline.teamAveragePercent}%`
          }
          label={t('plcDataOverview.teamAverage', {
            defaultValue: 'Team average',
          })}
        />
        {p.scoredStudents !== null && (
          <Figure
            value={
              <>
                {p.scoredStudents}{' '}
                <span className="text-lg font-semibold text-slate-400">
                  {t('plcDataOverview.ofTotal', {
                    total: p.totalStudents,
                    defaultValue: 'of {{total}}',
                  })}
                </span>
              </>
            }
            label={t('plcDataOverview.participationPct', {
              percent: p.percent ?? 0,
              defaultValue: 'Participation · {{percent}}%',
            })}
          />
        )}
        <Figure
          value={ia.reteachCount}
          label={t('plcDataOverview.toReteach', {
            defaultValue: 'Questions to reteach',
          })}
        />
      </div>

      <div className="mt-6">
        <SectionHead
          title={t('plcDataOverview.itemAnalysis', {
            defaultValue: 'Item analysis',
          })}
        >
          {ordered.length > 0 && (
            <>
              <MenuSelect
                label={t('plcDashboard.assessmentDetail.sortQuestions', {
                  defaultValue: 'Sort questions',
                })}
                value={sort}
                anchor={tourAttr('teams.data.sort-questions')}
                onChange={(v) => setSort(v as 'low' | 'order')}
                options={[
                  {
                    value: 'low',
                    label: t('plcDataOverview.lowestFirst', {
                      defaultValue: 'Lowest first',
                    }),
                  },
                  {
                    value: 'order',
                    label: t('plcDataOverview.questionOrder', {
                      defaultValue: 'Question order',
                    }),
                  },
                ]}
              />
              <ChartLegend items={itemLegend(t)} />
              <TableToggle
 table={table}
 onToggle={toggleTable}
 anchor={tourFieldAttr('teams.data.table-toggle','teams-data','items')}
 />
            </>
          )}
        </SectionHead>
        {ordered.length === 0 ? (
          <NoResults />
        ) : table ? (
          <DataTable
            caption={t('plcDataOverview.itemAnalysis', {
              defaultValue: 'Item analysis',
            })}
            head={[
              t('plcDataOverview.col.question', { defaultValue: 'Question' }),
              t('plcDataOverview.legend.correct', { defaultValue: 'Correct' }),
              t('plcDataOverview.legend.wrong', {
                defaultValue: 'Most common wrong answer',
              }),
            ]}
            rows={ordered.map((q) => [
              `Q${q.number} ${q.text}`,
              q.correctPercent === null ? '' : `${q.correctPercent}%`,
              q.dominantWrong
                ? `${q.dominantWrong.label}, ${q.dominantWrong.percent}%`
                : '',
            ])}
          />
        ) : (
          <>
            <BarRows
              columns={ITEM_COLUMNS}
              rows={buildItemRows(t, shown, {
                breakAfterReteach: sort === 'low',
                targetOf: tagged ? featured.targetOf : undefined,
              })}
            />
            {ordered.length > COMPACT_QUESTIONS && (
              <TextLink
                className="mt-2"
                onClick={() => setShowAll((v) => !v)}
                {...tourAttr('teams.data.show-all-questions')}
              >
                {showAll
                  ? t('plcDataOverview.showFewer', {
                      defaultValue: 'Show fewer',
                    })
                  : t('plcDataOverview.showAllQuestions', {
                      count: ordered.length,
                      defaultValue: 'Show all {{count}} questions',
                    })}
              </TextLink>
            )}
          </>
        )}
      </div>
    </Section>
  );
};

export const DistributionView: React.FC<{ featured: FeaturedAssessment }> = ({
  featured,
}) => {
  const { t } = useTranslation();
  const [table, toggleTable] = useToggle();
  const dist = featured.distribution;
  const yMax = Math.max(
    20,
    Math.ceil(Math.max(...dist.bands.map((b) => b.count)) / 20) * 20
  );
  const students = (n: number) =>
    t('plcDataOverview.nStudents', {
      count: n,
      defaultValue: '{{count}} students',
    });
  return (
    <div className="min-w-0">
      <SectionHead
        title={t('plcDataOverview.distribution', {
          defaultValue: 'Score distribution',
        })}
        meta={featured.shortTitle}
      >
        {dist.status === 'ready' && (
          <TableToggle
 table={table}
 onToggle={toggleTable}
 anchor={tourFieldAttr('teams.data.table-toggle','teams-data','distribution')}
 />
        )}
      </SectionHead>
      {dist.status !== 'ready' ? (
        <p className="text-sm text-slate-500">
          {dist.status === 'pending'
            ? t('plcDashboard.assessmentDetail.distributionPending', {
                defaultValue: 'Chart updates in a few minutes.',
              })
            : t('plcDashboard.assessmentDetail.distributionEmpty', {
                defaultValue:
                  'The chart fills in once teachers publish scores.',
              })}
        </p>
      ) : table ? (
        <DataTable
          head={[
            t('plcDataOverview.col.score', { defaultValue: 'Score' }),
            t('plcDataOverview.col.students', { defaultValue: 'Students' }),
          ]}
          rows={dist.bands.map((b) => [b.label, b.count])}
        />
      ) : (
        <ColumnChart
          ariaLabel={`${t('plcDataOverview.distribution', { defaultValue: 'Score distribution' })}, ${featured.title}`}
          yMax={yMax}
          yTicks={[0, yMax / 2, yMax]}
          xTitle={t('plcDataOverview.scoreAxis', { defaultValue: 'Score (%)' })}
          columns={dist.bands.map((b) => ({
            key: b.label,
            x: b.label.replace('%', ''),
            value: b.count,
            label: String(b.count),
            bg:
              SCORE_DISTRIBUTION_BANDS.find((s) => s.min === b.min)?.color ??
              'bg-slate-300',
            ariaLabel: `${b.label}, ${students(b.count)}`,
            tip: {
              heading: b.label,
              rows: [
                {
                  value: students(b.count),
                  label: t('plcDataOverview.pctOfTotal', {
                    percent: b.percent,
                    total: dist.total,
                    defaultValue: '{{percent}}% of {{total}}',
                  }),
                },
              ],
            },
          }))}
        />
      )}
    </div>
  );
};

export const TrendView: React.FC<{
  trend: TeamTrendPoint[];
  shortTitles: Record<string, string>;
}> = ({ trend, shortTitles }) => {
  const { t } = useTranslation();
  const [table, toggleTable] = useToggle();
  return (
    <div className="min-w-0">
      <SectionHead
        title={t('plcDataOverview.trend', {
          defaultValue: 'Team average over time',
        })}
      >
        {trend.length > 0 && (
          <TableToggle
 table={table}
 onToggle={toggleTable}
 anchor={tourFieldAttr('teams.data.table-toggle','teams-data','trend')}
 />
        )}
      </SectionHead>
      {trend.length === 0 ? (
        <NoResults />
      ) : table ? (
        <DataTable
          head={[
            t('plcDataOverview.col.assessment', {
              defaultValue: 'Assessment',
            }),
            t('plcDataOverview.col.average', { defaultValue: 'Average' }),
          ]}
          rows={trend.map((p) => [p.title, `${p.teamAveragePercent}%`])}
        />
      ) : (
        <TrendLine
          points={trend}
          shortTitles={shortTitles}
          ariaLabel={t('plcDataOverview.trend', {
            defaultValue: 'Team average over time',
          })}
        />
      )}
    </div>
  );
};

export const ParticipationView: React.FC<{
  rows: ParticipationRow[];
  shortTitles: Record<string, string>;
}> = ({ rows, shortTitles }) => {
  const { t } = useTranslation();
  const fmt = useDateFormat();
  const [table, toggleTable] = useToggle();
  const min = Math.min(...rows.map((r) => r.students.percent ?? 0));
  const ofStudents = (r: ParticipationRow) =>
    t('plcDataOverview.nOfTotalStudents', {
      count: r.students.scoredStudents ?? 0,
      total: r.students.totalStudents,
      defaultValue: '{{count}} of {{total}} students',
    });
  return (
    <div className="min-w-0">
      <SectionHead
        title={t('plcDataOverview.participation', {
          defaultValue: 'Participation',
        })}
      >
        {rows.length > 0 && (
          <TableToggle
 table={table}
 onToggle={toggleTable}
 anchor={tourFieldAttr('teams.data.table-toggle','teams-data','participation')}
 />
        )}
      </SectionHead>
      {rows.length === 0 ? (
        <NoResults />
      ) : table ? (
        <DataTable
          head={[
            t('plcDataOverview.col.assessment', {
              defaultValue: 'Assessment',
            }),
            t('plcDataOverview.col.students', { defaultValue: 'Students' }),
            t('plcDataOverview.col.rate', { defaultValue: 'Rate' }),
          ]}
          rows={rows.map((r) => [
            r.title,
            t('plcDataOverview.nOfTotal', {
              count: r.students.scoredStudents ?? 0,
              total: r.students.totalStudents,
              defaultValue: '{{count}} of {{total}}',
            }),
            `${r.students.percent ?? 0}%`,
          ])}
        />
      ) : (
        <ColumnChart
          ariaLabel={t('plcDataOverview.participation', {
            defaultValue: 'Participation',
          })}
          yMax={100}
          yTicks={[0, 50, 100]}
          yUnit="%"
          maxBarWidth={28}
          columns={rows.map((r, i) => {
            const pct = r.students.percent ?? 0;
            const labelled = i === rows.length - 1 || pct === min;
            return {
              key: r.assessmentId,
              x: shortTitles[r.assessmentId] ?? r.title,
              value: pct,
              ...(labelled ? { label: `${pct}%` } : {}),
              bg: 'bg-brand-blue-light',
              ariaLabel: `${r.title}, ${pct}%`,
              tip: {
                heading: `${r.title} · ${fmt(r.date)}`,
                rows: [
                  { value: `${pct}%`, label: ofStudents(r) },
                  {
                    value: t('plcDataOverview.nOfTotal', {
                      count: r.teachersRan,
                      total: r.teachersExpected,
                      defaultValue: '{{count}} of {{total}}',
                    }),
                    label: t('plcDataOverview.teachersRan', {
                      defaultValue: 'teachers ran it',
                    }),
                  },
                ],
              },
            };
          })}
        />
      )}
    </div>
  );
};

export interface MasteryViewProps {
  layer: MasteryLayer;
  isLead: boolean;
  onManageTargets?: () => void;
}

/** Mastery on one assessment's tagged questions. */
export const MasteryView: React.FC<MasteryViewProps> = ({
  layer,
  isLead,
  onManageTargets,
}) => {
  const { t } = useTranslation();
  const bandLabel = useBandLabel();
  const [table, toggleTable] = useToggle();
  const { cutoffs } = layer.mastery;
  const rows = [...layer.mastery.targets, ...layer.mastery.standards];
  const questionsLabel = (n: number) =>
    t('plcDataOverview.nQuestions', {
      count: n,
      defaultValue_one: '{{count}} question',
      defaultValue_other: '{{count}} questions',
    });
  return (
    <>
      <SectionHead
        title={t('plcDataOverview.mastery', {
          defaultValue: 'Mastery by learning target',
        })}
        meta={t('plcDataOverview.masteryMeta', {
          title: layer.title,
          defaultValue: '{{title}} · percent correct on tagged questions',
        })}
      >
        {isLead && onManageTargets && (
          <TextLink
            icon={Target}
            onClick={onManageTargets}
            {...tourAttr('teams.data.manage-targets')}
          >
            {t('plcDataOverview.manageTargets', {
              defaultValue: 'Manage targets',
            })}
          </TextLink>
        )}
        <TableToggle
 table={table}
 onToggle={toggleTable}
 anchor={tourFieldAttr('teams.data.table-toggle','teams-data','mastery')}
 />
      </SectionHead>
      {table ? (
        <DataTable
          head={[
            t('plcDataOverview.col.target', { defaultValue: 'Target' }),
            t('plcDataOverview.legend.correct', { defaultValue: 'Correct' }),
            t('plcDataOverview.col.band', { defaultValue: 'Band' }),
            t('plcDataOverview.col.questions', { defaultValue: 'Questions' }),
          ]}
          rows={rows.map((m) => [
            `${m.code ?? ''} ${m.label}`.trim(),
            `${m.correctPercent ?? 0}%`,
            bandLabel(m.band),
            layer.questionsPerTarget[m.targetId] ?? 0,
          ])}
        />
      ) : (
        <BarRows
          ticks={[0, cutoffs.approaching, cutoffs.proficient, 100]}
          columns="grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,13rem)]"
          rows={rows.map((m) => {
            const pct = m.correctPercent ?? 0;
            const questions = layer.questionsPerTarget[m.targetId] ?? 0;
            const band = bandLabel(m.band);
            const swatch = m.band ? MASTERY_BAR_CLASS[m.band] : 'bg-slate-300';
            return {
              key: m.targetId,
              label: (
                <span className="flex min-w-0 items-start gap-2 py-1.5">
                  {m.code && (
                    <span className="w-14 shrink-0 font-bold text-slate-800">
                      {m.code}
                    </span>
                  )}
                  <span className="min-w-0 break-words">{m.label}</span>
                </span>
              ),
              segments: [{ value: pct, bg: swatch }],
              value: (
                <span className="flex items-baseline gap-2">
                  <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-slate-800">
                    {pct}%
                  </span>
                  <span className="min-w-0 break-words">
                    {band ? `${band} · ` : ''}
                    {questionsLabel(questions)}
                  </span>
                </span>
              ),
              ariaLabel: `${m.code ?? m.label}, ${pct}%${band ? `, ${band}` : ''}`,
              tip: {
                heading: m.code ? `${m.code} · ${m.label}` : m.label,
                rows: [
                  {
                    value: `${pct}%`,
                    label: t('plcDataOverview.tip.correctBand', {
                      band: band.toLowerCase(),
                      defaultValue: 'correct, {{band}}',
                    }),
                    swatch,
                  },
                  {
                    value: String(questions),
                    label: t('plcDataOverview.tip.tagged', {
                      defaultValue: 'tagged questions',
                    }),
                  },
                ],
              },
            };
          })}
        />
      )}
    </>
  );
};

/** T18: the lead's quiet prompt when nothing is tagged; members never see it. */
export const TagPrompt: React.FC<{ onTag: () => void }> = ({ onTag }) => {
  const { t } = useTranslation();
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
      <Target className="h-4 w-4 text-slate-400" aria-hidden="true" />
      {t('plcDataOverview.tagPrompt', {
        defaultValue:
          'Tag questions to learning targets to see mastery by target.',
      })}
      <TextLink onClick={onTag} {...tourAttr('teams.data.tag-questions')}>
        {t('plcDataOverview.tagQuestions', { defaultValue: 'Tag questions' })}
      </TextLink>
    </p>
  );
};

export const RecentAssessmentsView: React.FC<{
  rows: RecentAssessmentRow[];
  onOpen: (assessmentId: string) => void;
  onAll: () => void;
}> = ({ rows, onOpen, onAll }) => {
  const { t } = useTranslation();
  const fmt = useDateFormat();
  return (
    <div className="min-w-0">
      <SectionHead
        title={t('plcDataOverview.recent', {
          defaultValue: 'Recent assessments',
        })}
      >
        <TextLink onClick={onAll} {...tourAttr('teams.data.all-assessments')}>
          {t('plcDataOverview.allAssessments', {
            defaultValue: 'All assessments',
          })}
        </TextLink>
      </SectionHead>
      {rows.length === 0 ? (
        <NoResults />
      ) : (
        <DataTable
          head={[
            t('plcDataOverview.col.assessment', {
              defaultValue: 'Assessment',
            }),
            t('plcDataOverview.col.closed', { defaultValue: 'Closed' }),
            t('plcDataOverview.col.average', { defaultValue: 'Average' }),
            t('plcDataOverview.participation', {
              defaultValue: 'Participation',
            }),
          ]}
          rows={rows.map((r) => [
            <button
              key={r.assessmentId}
              type="button"
              {...tourFieldAttr('teams.data.recent-assessment', 'teams-data', r.assessmentId)}
              onClick={() => onOpen(r.assessmentId)}
              className="text-left font-semibold text-brand-blue-primary hover:text-brand-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            >
              {r.title}
            </button>,
            fmt(r.date),
            `${r.teamAveragePercent}%`,
            r.scoredStudents === null
              ? ''
              : t('plcDataOverview.nOfTotal', {
                  count: r.scoredStudents,
                  total: r.totalStudents,
                  defaultValue: '{{count}} of {{total}}',
                }),
          ])}
        />
      )}
    </div>
  );
};

export interface MeetingStripProps {
  /** Formatted "Thu, Oct 9 · 3:15 PM"; null hides the meeting entry. */
  nextMeeting: string | null;
  openItems: { total: number; mine: number } | null;
  /** Decided decisions with a revisit date ahead; null hides the entry. */
  revisit?: { count: number; next: number } | null;
  onOpenNote: () => void;
  onViewItems: () => void;
}

export const MeetingStripView: React.FC<MeetingStripProps> = ({
  nextMeeting,
  openItems,
  revisit = null,
  onOpenNote,
  onViewItems,
}) => {
  const { t } = useTranslation();
  const fmtDate = useDateFormat();
  if (!nextMeeting && !openItems && !revisit) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
      {nextMeeting && (
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <span className="font-semibold text-slate-800">
            {t('plcDataOverview.nextMeeting', { defaultValue: 'Next meeting' })}
          </span>
          <span className="text-slate-500">{nextMeeting}</span>
          <TextLink onClick={onOpenNote} {...tourAttr('teams.data.open-next-note')}>
            {t('plcDataOverview.openNote', { defaultValue: 'Open note' })}
          </TextLink>
        </span>
      )}
      {openItems && (
        <span className="inline-flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <span className="font-semibold text-slate-800">
            {t('plcDataOverview.openItems', { defaultValue: 'Open items' })}
          </span>
          <span className="text-slate-500">
            {t('plcDataOverview.openItemsCount', {
              total: openItems.total,
              mine: openItems.mine,
              defaultValue: '{{total}} · {{mine}} yours',
            })}
          </span>
          <TextLink onClick={onViewItems} {...tourAttr('teams.data.view-open-items')}>
            {t('plcDataOverview.view', { defaultValue: 'View' })}
          </TextLink>
        </span>
      )}
      {revisit && (
        <span className="inline-flex items-center gap-2">
          <Scale className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <span className="font-semibold text-slate-800">
            {t('plcDataOverview.decisionsToRevisit', {
              defaultValue: 'Decisions to revisit',
            })}
          </span>
          <span className="text-slate-500">
            {t('plcDataOverview.revisitCount', {
              count: revisit.count,
              date: fmtDate(revisit.next),
              defaultValue: '{{count}} · {{date}}',
            })}
          </span>
        </span>
      )}
    </div>
  );
};

export { Section };
