// Pooled scored paper work for a PLC: one card per series, plus each rubric criterion followed over time.

import React, { useMemo } from 'react';
import { usePlcScoredWork } from '@/hooks/usePlcScoredWork';
import {
  SCORED_WORK_LOW_SAMPLE,
  buildScoredWorkTrend,
} from '@/utils/scoredWorkTrend';
import type { Plc, PlcScoredWorkAggregate } from '@/types';

const formatDate = (ms: number): string => new Date(ms).toLocaleDateString();

const Bar: React.FC<{ percent: number; label: string }> = ({
  percent,
  label,
}) => (
  <div
    role="img"
    aria-label={`${label} ${percent} percent`}
    className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden"
  >
    <div
      className="h-full rounded-full bg-brand-blue-primary"
      style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
    />
  </div>
);

const SeriesCard: React.FC<{ agg: PlcScoredWorkAggregate }> = ({ agg }) => {
  const thin = agg.studentCount < SCORED_WORK_LOW_SAMPLE;
  const weakest = [...agg.criteria].sort(
    (a, b) => a.averagePercent - b.averagePercent
  )[0];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold text-slate-800">
          {agg.seriesLabel}
        </h3>
        <span className="text-sm text-slate-600">
          {agg.teacherCount} {agg.teacherCount === 1 ? 'teacher' : 'teachers'} ·{' '}
          {agg.studentCount} students · {formatDate(agg.lastPublishedAt)}
        </span>
        <span className="ml-auto text-lg font-semibold text-slate-800">
          {agg.averagePercent}%
        </span>
      </header>
      {thin && (
        <p className="text-xs text-amber-700">
          Fewer than {SCORED_WORK_LOW_SAMPLE} students, so treat this as a rough
          read.
        </p>
      )}
      <ul className="space-y-2">
        {agg.criteria.map((c) => (
          <li key={c.name} className="flex items-center gap-3 text-sm">
            <span className="w-40 shrink-0 truncate text-slate-700">
              {c.name}
            </span>
            <Bar percent={c.averagePercent} label={c.name} />
            <span className="w-10 text-right text-slate-700">
              {c.averagePercent}%
            </span>
          </li>
        ))}
      </ul>
      {weakest && agg.criteria.length > 1 && (
        <p className="text-sm text-slate-600">
          Lowest: {weakest.name} at {weakest.averagePercent}%.
        </p>
      )}
    </section>
  );
};

export const PlcScoredWorkBody: React.FC<{ plc: Plc }> = ({ plc }) => {
  const { aggregates, loading, error } = usePlcScoredWork(plc.id);
  const trend = useMemo(() => buildScoredWorkTrend(aggregates), [aggregates]);

  if (error) {
    return (
      <p className="text-sm text-rose-700">
        Scored work could not be loaded. Try again later.
      </p>
    );
  }
  if (!loading && aggregates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">No scored work yet</p>
        <p>Share scored paper work from the sidebar to see it here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {trend.rows.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <h3 className="text-base font-semibold text-slate-800">Over time</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th scope="col" className="py-1 pr-4 font-medium">
                    Criterion
                  </th>
                  {trend.columns.map((c) => (
                    <th
                      key={c.seriesKey}
                      scope="col"
                      className="py-1 px-3 font-medium whitespace-nowrap"
                    >
                      {c.seriesLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trend.rows.map((row) => (
                  <tr key={row.name} className="border-t border-slate-100">
                    <th
                      scope="row"
                      className="py-1.5 pr-4 text-left font-normal text-slate-700"
                    >
                      {row.name}
                    </th>
                    {row.values.map((v, i) => (
                      <td
                        key={trend.columns[i].seriesKey}
                        className="py-1.5 px-3 text-slate-800"
                      >
                        {v === null ? '' : `${v}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {aggregates.map((agg) => (
        <SeriesCard key={agg.seriesKey} agg={agg} />
      ))}
    </div>
  );
};
