// Per-teacher tile: each teacher's class average on one common assessment (only with showPerTeacher).

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, Users2 } from 'lucide-react';
import {
  usePlcAggregatesData,
  usePlcAssessmentsData,
} from '@/context/usePlcContext';
import { usePlcLearningTargets } from '@/hooks/useLearningTargets';
import { DEFAULT_MASTERY_CUTOFFS } from '@/utils/learningTargets';
import { masteryBandFor } from '@/utils/quizTargetStats';
import { TileEmpty, TileFrame } from './TileFrame';
import { perTeacherBars, pickPerTeacherAggregate } from './catalogSelectors';
import { MASTERY_BAR_CLASS, assessmentRunDate } from './resultsSelectors';
import type { PlcHomeTileProps } from './tileTypes';

export const PerTeacherTile: React.FC<PlcHomeTileProps> = ({
  tile,
  ctx,
  hero,
  controls,
  onOptionsChange,
}) => {
  const { t } = useTranslation();
  const { data: aggregates, loading: aggregatesLoading } =
    usePlcAggregatesData();
  const { data: assessments, loading: assessmentsLoading } =
    usePlcAssessmentsData();
  const { list: targetList } = usePlcLearningTargets(ctx.plc.id);
  const cutoffs = targetList?.masteryCutoffs ?? DEFAULT_MASTERY_CUTOFFS;
  const [picking, setPicking] = useState(false);

  const picked = useMemo(
    () =>
      pickPerTeacherAggregate({
        aggregates,
        assessments,
        assessmentId: tile.options?.assessmentId,
      }),
    [aggregates, assessments, tile.options?.assessmentId]
  );
  const bars = useMemo(
    () => (picked ? perTeacherBars(picked.aggregate) : []),
    [picked]
  );
  const choices = useMemo(() => {
    const withResults = new Set(
      aggregates
        .filter((a) => a.perTeacher.length > 0)
        .map((a) => a.assessmentId)
    );
    return assessments
      .filter((a) => a.deletedAt == null && withResults.has(a.id))
      .sort((a, b) => assessmentRunDate(b) - assessmentRunDate(a));
  }, [aggregates, assessments]);
  const loading = aggregatesLoading || assessmentsLoading;

  const choose = (assessmentId: string | undefined) => {
    onOptionsChange?.(assessmentId ? { assessmentId } : {});
    setPicking(false);
  };

  const pickerButton = onOptionsChange && (
    <button
      type="button"
      onClick={() => setPicking((p) => !p)}
      aria-expanded={picking}
      aria-label={t('plcDashboard.home.perTeacher.chooseAssessment', {
        defaultValue: 'Choose assessment',
      })}
      title={t('plcDashboard.home.perTeacher.chooseAssessment', {
        defaultValue: 'Choose assessment',
      })}
      className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
    >
      <Settings2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  return (
    <TileFrame
      icon={Users2}
      title={t('plcDashboard.home.perTeacher.title', {
        defaultValue: 'Per-teacher averages',
      })}
      hero={hero}
      headerExtra={
        <>
          {pickerButton}
          {controls}
        </>
      }
    >
      {picking && (
        <div
          role="listbox"
          aria-label={t('plcDashboard.home.perTeacher.chooseAssessment', {
            defaultValue: 'Choose assessment',
          })}
          className="mb-3 flex max-h-48 flex-col overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-1"
        >
          <button
            type="button"
            role="option"
            aria-selected={!tile.options?.assessmentId}
            onClick={() => choose(undefined)}
            className="rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-white"
          >
            {t('plcDashboard.home.perTeacher.latest', {
              defaultValue: 'Latest with results',
            })}
          </button>
          {choices.map((a) => (
            <button
              key={a.id}
              type="button"
              role="option"
              aria-selected={tile.options?.assessmentId === a.id}
              onClick={() => choose(a.id)}
              className="truncate rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-white"
            >
              {a.title}
            </button>
          ))}
        </div>
      )}
      {!picked ? (
        !loading && (
          <TileEmpty>
            {t('plcDashboard.home.perTeacher.empty', {
              defaultValue: 'No results to compare yet.',
            })}
          </TileEmpty>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <p className="truncate text-xs font-semibold text-slate-500">
            {picked.assessment.title}
          </p>
          <ul className="flex flex-col">
            {bars.map((bar) => {
              const band =
                masteryBandFor(bar.averagePercent, cutoffs) ?? 'beginning';
              return (
                <li
                  key={bar.teacherUid}
                  className="flex items-center gap-3 py-1.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-700">
                      {bar.teacherName}
                    </span>
                    {hero && (
                      <span className="block text-xs text-slate-500">
                        {t('plcDashboard.home.perTeacher.classes', {
                          count: bar.classCount,
                          students: bar.studentCount,
                          defaultValue:
                            bar.classCount === 1
                              ? '1 class · {{students}} students'
                              : '{{count}} classes · {{students}} students',
                        })}
                      </span>
                    )}
                  </span>
                  <span
                    className={`h-2 shrink-0 overflow-hidden rounded-full bg-slate-100 ${hero ? 'w-40' : 'w-24'}`}
                  >
                    <span
                      className={`block h-full rounded-full ${MASTERY_BAR_CLASS[band]}`}
                      style={{
                        width: `${Math.min(100, Math.max(0, bar.averagePercent))}%`,
                      }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-slate-700">
                    {Math.round(bar.averagePercent)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </TileFrame>
  );
};
