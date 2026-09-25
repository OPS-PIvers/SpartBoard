// Results tile: mastery by learning target, the featured common assessment, and live assignments.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ExternalLink,
  Presentation,
} from 'lucide-react';
import type { PlcAssignmentIndexEntry } from '@/types';
import {
  usePlcAggregatesData,
  usePlcAssessmentsData,
  usePlcMeetingsData,
  usePlcMembers,
} from '@/context/usePlcContext';
import { usePlcAssignmentIndex } from '@/hooks/usePlcAssignmentIndex';
import { usePlcLearningTargets } from '@/hooks/useLearningTargets';
import { DEFAULT_MASTERY_CUTOFFS } from '@/utils/learningTargets';
import { masteryBandFor } from '@/utils/quizTargetStats';
import {
  buildCommonAssessmentBanner,
  type CommonAssessmentBannerModel,
  type CommonAssessmentBannerPhase,
} from '@/components/plc/home/cards/commonAssessmentBannerSelectors';
import { TileEmpty, TileFrame } from './TileFrame';
import {
  MASTERY_BAR_CLASS,
  isLiveAssignment,
  latestTargetMastery,
  type ResultsRollup,
  type TargetMasteryRow,
} from './resultsSelectors';
import type { PlcHomeTileProps } from './tileTypes';

/** Newest index entries Home reads; an older still-active one can be missed (plan §6). */
const HOME_ASSIGNMENT_INDEX_LIMIT = 25;

const COMPACT_ROWS = 3;
const HERO_ASSIGNMENTS = 5;

type TFn = ReturnType<typeof useTranslation>['t'];

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function phaseLabel(t: TFn, phase: CommonAssessmentBannerPhase): string {
  switch (phase) {
    case 'planning':
      return t('plcDashboard.home.commonAssessment.phase.planningShort', {
        defaultValue: 'Not run yet',
      });
    case 'running':
      return t('plcDashboard.home.commonAssessment.phase.running', {
        defaultValue: 'In progress',
      });
    case 'ready':
      return t('plcDashboard.home.commonAssessment.phase.ready', {
        defaultValue: 'Ready to review',
      });
    case 'reviewing':
      return t('plcDashboard.home.commonAssessment.phase.reviewing', {
        defaultValue: 'Reviewing together',
      });
    case 'closed':
      return t('plcDashboard.home.commonAssessment.phase.closed', {
        defaultValue: 'Closed',
      });
  }
}

const MasteryRow: React.FC<{
  row: TargetMasteryRow;
  cutoffs: { proficient: number; approaching: number };
  showTrend: boolean;
}> = ({ row, cutoffs, showTrend }) => {
  const { t } = useTranslation();
  const band = masteryBandFor(row.correctPercent, cutoffs) ?? 'beginning';
  const barClass = row.lowSample ? 'bg-slate-300' : MASTERY_BAR_CLASS[band];
  const name = row.code ? `${row.code} ${row.label}` : row.label;
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm ${row.lowSample ? 'text-slate-400' : 'text-slate-700'}`}
          title={name}
        >
          {row.code && (
            <span className="mr-1.5 font-semibold text-slate-500">
              {row.code}
            </span>
          )}
          {row.label}
        </span>
      </span>
      {row.lowSample && (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xxs font-semibold text-slate-500">
          {t('plcDashboard.home.results.fewAnswers', {
            defaultValue: 'few answers',
          })}
        </span>
      )}
      {showTrend && row.trend && (
        <span
          className={`shrink-0 ${row.trend === 'up' ? 'text-emerald-600' : 'text-brand-red-primary'}`}
          role="img"
          aria-label={
            row.trend === 'up'
              ? t('plcDashboard.home.results.trendUp', {
                  defaultValue: 'Up since the last assessment',
                })
              : t('plcDashboard.home.results.trendDown', {
                  defaultValue: 'Down since the last assessment',
                })
          }
        >
          {row.trend === 'up' ? (
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </span>
      )}
      <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100">
        <span
          className={`block h-full rounded-full ${barClass}`}
          style={{
            width: `${Math.min(100, Math.max(0, row.correctPercent))}%`,
          }}
        />
      </span>
      <span
        className={`w-10 shrink-0 text-right text-sm font-bold tabular-nums ${row.lowSample ? 'text-slate-400' : 'text-slate-700'}`}
      >
        {row.correctPercent}%
      </span>
    </li>
  );
};

const FallbackHint: React.FC<{
  rollup: ResultsRollup;
  onOpenTargets: () => void;
}> = ({ rollup, onOpenTargets }) => {
  const { t } = useTranslation();
  if (rollup.mode === 'targets' || rollup.mode === 'empty') return null;
  return (
    <p className="mt-2 text-xs text-slate-500">
      <button
        type="button"
        onClick={onOpenTargets}
        className="font-semibold text-brand-blue-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 rounded"
      >
        {t('plcDashboard.home.results.openTargets', {
          defaultValue: 'Tag questions with learning targets',
        })}
      </button>
    </p>
  );
};

const RollupView: React.FC<{
  rollup: ResultsRollup;
  hero: boolean;
  cutoffs: { proficient: number; approaching: number };
  onOpenTargets: () => void;
}> = ({ rollup, hero, cutoffs, onOpenTargets }) => {
  const { t } = useTranslation();
  if (rollup.mode === 'empty') {
    return (
      <TileEmpty>
        {t('plcDashboard.home.results.empty', {
          defaultValue:
            'Results appear here once the team runs a common assessment.',
        })}
      </TileEmpty>
    );
  }
  if (rollup.mode === 'questions') {
    return (
      <div>
        <p className="text-xs font-semibold text-slate-500">
          {t('plcDashboard.home.results.hardestQuestions', {
            defaultValue: 'Hardest questions on the latest assessment',
          })}
        </p>
        {rollup.weakQuestions.length === 0 ? (
          <TileEmpty>
            {t('plcDashboard.home.results.noQuestions', {
              defaultValue: 'Not enough answers yet.',
            })}
          </TileEmpty>
        ) : (
          <ol className="mt-1">
            {rollup.weakQuestions.map((q) => (
              <li key={q.questionId} className="flex items-center gap-3 py-1.5">
                <span
                  className="min-w-0 flex-1 truncate text-sm text-slate-700"
                  title={q.text}
                >
                  {q.text}
                </span>
                <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-slate-700">
                  {q.correctPercent}%
                </span>
              </li>
            ))}
          </ol>
        )}
        <FallbackHint rollup={rollup} onOpenTargets={onOpenTargets} />
      </div>
    );
  }
  const rows = hero ? rollup.rows : rollup.rows.slice(0, COMPACT_ROWS);
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">
        {hero
          ? rollup.mode === 'targets'
            ? t('plcDashboard.home.results.allTargets', {
                defaultValue: 'This year, weakest first',
              })
            : t('plcDashboard.home.results.allStandards', {
                defaultValue: 'This year, weakest first',
              })
          : rollup.mode === 'targets'
            ? t('plcDashboard.home.results.weakestTargets', {
                defaultValue: 'Weakest learning targets',
              })
            : t('plcDashboard.home.results.weakestStandards', {
                defaultValue: 'Weakest standards',
              })}
      </p>
      <ul className="mt-1">
        {rows.map((row) => (
          <MasteryRow
            key={row.targetId}
            row={row}
            cutoffs={cutoffs}
            showTrend
          />
        ))}
      </ul>
      <FallbackHint rollup={rollup} onOpenTargets={onOpenTargets} />
    </div>
  );
};

const FeaturedAssessment: React.FC<{
  model: CommonAssessmentBannerModel;
  hero: boolean;
  onOpenMeeting: () => void;
}> = ({ model, hero, onOpenMeeting }) => {
  const { t } = useTranslation();
  const ran = t('plcDashboard.home.commonAssessment.ranIt', {
    ran: model.ranCount,
    total: model.expectedCount,
    defaultValue: '{{ran}} of {{total}} ran it',
  });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-slate-50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">
          {model.assessment.title}
        </p>
        <p className="text-xs text-slate-500">
          {ran}
          <span className="mx-1.5 text-slate-300" aria-hidden="true">
            ·
          </span>
          {phaseLabel(t, model.phase)}
        </p>
      </div>
      {hero && (
        <button
          type="button"
          onClick={onOpenMeeting}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50 focus-visible:ring-offset-2"
        >
          <Presentation className="h-3.5 w-3.5" aria-hidden="true" />
          {model.inProgressMeeting
            ? t('plcDashboard.home.commonAssessment.resumeMeeting', {
                defaultValue: 'Resume Meeting',
              })
            : t('plcDashboard.home.commonAssessment.startMeeting', {
                defaultValue: 'Start Meeting',
              })}
        </button>
      )}
    </div>
  );
};

const LiveAssignments: React.FC<{ entries: PlcAssignmentIndexEntry[] }> = ({
  entries,
}) => {
  const { t } = useTranslation();
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">
        {t('plcDashboard.home.results.liveAssignments', {
          defaultValue: 'Live assignments',
        })}
      </p>
      <ul className="mt-1">
        {entries.slice(0, HERO_ASSIGNMENTS).map((entry) => {
          const owner = entry.ownerName?.trim() || entry.ownerEmail || '';
          const safeUrl = isSafeHttpUrl(entry.sheetUrl) ? entry.sheetUrl : null;
          return (
            <li key={entry.id} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-700">
                  {entry.title}
                </span>
                <span className="block truncate text-xs text-slate-400">
                  {entry.status === 'paused'
                    ? t('plcDashboard.assignmentsInProgress.statusPaused', {
                        defaultValue: 'Paused',
                      })
                    : t('plcDashboard.assignmentsInProgress.statusActive', {
                        defaultValue: 'Active',
                      })}
                  {owner && ` · ${owner}`}
                </span>
              </span>
              {safeUrl && (
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-brand-blue-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
                  aria-label={t('plcDashboard.home.attention.openSheetFor', {
                    title: entry.title,
                    defaultValue: 'Open results sheet for {{title}}',
                  })}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const ResultsTile: React.FC<PlcHomeTileProps> = ({
  ctx,
  hero,
  controls,
}) => {
  const { t } = useTranslation();
  const { data: aggregates } = usePlcAggregatesData();
  const { data: assessments } = usePlcAssessmentsData();
  const { data: meetings } = usePlcMeetingsData();
  const members = usePlcMembers();
  const { entries } = usePlcAssignmentIndex(ctx.plc.id, {
    limit: HOME_ASSIGNMENT_INDEX_LIMIT,
  });
  const { list: targetList } = usePlcLearningTargets(ctx.plc.id);
  const cutoffs = targetList?.masteryCutoffs ?? DEFAULT_MASTERY_CUTOFFS;

  const rollup = useMemo(
    () => latestTargetMastery(aggregates, assessments, { now: ctx.now }),
    [aggregates, assessments, ctx.now]
  );
  const featured = useMemo(() => {
    const aggregatesById = new Map(aggregates.map((a) => [a.assessmentId, a]));
    return buildCommonAssessmentBanner({
      assessments,
      aggregatesById,
      meetings,
      memberCount: members.length,
    });
  }, [aggregates, assessments, meetings, members.length]);
  const live = useMemo(() => entries.filter(isLiveAssignment), [entries]);

  const openTargets = () => ctx.onNavigate('targets');
  const openMeeting = () => ctx.onNavigate('meeting');

  return (
    <TileFrame
      icon={BarChart3}
      title={t('plcDashboard.home.results.title', { defaultValue: 'Results' })}
      hero={hero}
      headerExtra={controls}
      link={{
        label: t('plcDashboard.home.results.open', {
          defaultValue: 'Open Assessments',
        }),
        onClick: () => ctx.onNavigate('assessments'),
      }}
    >
      {hero ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <RollupView
            rollup={rollup}
            hero
            cutoffs={cutoffs}
            onOpenTargets={openTargets}
          />
          <div className="flex flex-col gap-4">
            {featured && (
              <FeaturedAssessment
                model={featured}
                hero
                onOpenMeeting={openMeeting}
              />
            )}
            {live.length > 0 && <LiveAssignments entries={live} />}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {featured && (
            <FeaturedAssessment
              model={featured}
              hero={false}
              onOpenMeeting={openMeeting}
            />
          )}
          <RollupView
            rollup={rollup}
            hero={false}
            cutoffs={cutoffs}
            onOpenTargets={openTargets}
          />
          {live.length > 0 && (
            <p className="text-xs text-slate-500">
              {t('plcDashboard.home.results.liveCount', {
                count: live.length,
                defaultValue:
                  live.length === 1
                    ? '1 live assignment'
                    : '{{count}} live assignments',
              })}
            </p>
          )}
        </div>
      )}
    </TileFrame>
  );
};
