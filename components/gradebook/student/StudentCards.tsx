import React, { useMemo, useState } from 'react';
import { useGradebook } from '@/components/gradebook/GradebookContext';
import { Private } from '@/components/gradebook/Private';
import { GRADEBOOK_KIND_META } from '@/components/gradebook/kindMeta';
import { cellAnchorId } from '@/components/gradebook/cellFormat';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import {
  BarList,
  DistributionStrip,
  ScoreTrendChart,
  bandFor,
  bandRanges,
} from '@/components/gradebook/charts';
import { flagChipClasses, formatScore } from '@/utils/gradebook/gradebookModel';
import { buildGradebookPath } from '@/utils/gradebookPath';
import { spaNavigate } from '@/utils/plcPath';
import type { AnalysisTarget } from '@/utils/gradebook/gradebookAnalysis';
import type { GradebookInsight } from '@/utils/gradebook/gradebookInsights';
import { InsightList } from '@/components/gradebook/analysis/InsightList';
import type {
  ProficiencyMethod,
  ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import {
  categoryGrades,
  comparisonRows,
  median,
  trendPoints,
  whatIfOverall,
  type TargetRow,
  type WorkHabits,
} from './studentViewModel';

const METHOD_LABEL: Record<ProficiencyMethod, string> = {
  decaying: 'Decaying average',
  mean: 'Mean',
  recent: 'Most recent',
  highest: 'Highest',
};

const shortDate = (at: number | null): string =>
  at === null
    ? ''
    : new Date(at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });

const fmtPct = (v: number | null): string =>
  v === null ? '–' : `${Math.round(v)}%`;

interface StudentCardProps {
  studentUid: string;
  first: string;
  scale: ProficiencyScale;
}

export const PerformanceCard: React.FC<StudentCardProps> = ({
  studentUid,
  first,
  scale,
}) => {
  const gb = useGradebook();
  const { settings, columns, getCell } = gb;
  const uids = useMemo(() => gb.students.map((s) => s.uid), [gb.students]);
  const points = useMemo(
    () => trendPoints(columns, getCell, studentUid, uids),
    [columns, getCell, studentUid, uids]
  );
  const cats = settings.categoriesEnabled ? settings.categories : [];
  const grades = categoryGrades(columns, getCell, studentUid, cats);
  const whatIfCat = cats[0] ?? null;
  const catMaxes = columns
    .filter(
      (c) => !c.completionOnly && (!whatIfCat || c.categoryId === whatIfCat.id)
    )
    .map((c) => c.max)
    .filter((m): m is number => m !== null && m > 0);
  const whatIfMax = Math.round(median(catMaxes) ?? 100);
  const [score, setScore] = useState(() => Math.round(whatIfMax * 0.9));
  const projected = whatIfOverall(
    columns,
    getCell,
    studentUid,
    settings.categoriesEnabled,
    settings.categories,
    { categoryId: whatIfCat?.id ?? '', points: score, max: whatIfMax }
  );

  return (
    <>
      {grades.length > 0 && (
        <BarList
          rows={grades.map((g) => ({
            id: g.id,
            label: `${g.name} · ${g.weight}%`,
            value: g.pct,
            text: <Private>{fmtPct(g.pct)}</Private>,
          }))}
        />
      )}
      <ScoreTrendChart
        scale={scale}
        height={240}
        points={points.map((p) => ({
          id: p.sessionId,
          label: shortDate(p.at),
          title: p.title,
          pct: p.pct,
          median: p.median,
          zeroed: p.fromFlag,
        }))}
        seriesLabel={first}
        onSelect={(id) => gb.openCell(id, studentUid)}
      />
      <div className="text-xs text-slate-500">
        Solid: <Private>{first}</Private> · dashed: class median · red dot:
        Missing counted as 0
      </div>
      <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          What if
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="gb-whatif">
            If <Private>{first}</Private> scores
          </label>
          <input
            id="gb-whatif"
            {...tourAttr('gradebook.student.what-if')}
            type="number"
            min={0}
            max={whatIfMax}
            value={score}
            onChange={(e) => setScore(Number(e.target.value) || 0)}
            className="h-9 w-[70px] rounded-lg border border-slate-300 bg-white px-2.5 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30"
          />
          <span>
            / {whatIfMax} on the next
            {whatIfCat ? ` ${whatIfCat.name}` : ''} assignment, overall becomes{' '}
            <b className="text-slate-900">
              <Private>{fmtPct(projected)}</Private>
            </b>
          </span>
        </div>
      </div>
    </>
  );
};

export const HabitsCard: React.FC<{ habits: WorkHabits }> = ({ habits }) => {
  const h = habits;
  const segs: { n: number; cls: string; label: string }[] = [
    { n: h.onTime, cls: 'bg-emerald-600', label: 'On time' },
    { n: h.late, cls: 'bg-amber-500', label: 'Late' },
    { n: h.missing, cls: 'bg-brand-red-primary', label: 'Missing' },
    { n: h.excused, cls: 'bg-slate-400', label: 'Excused' },
  ];
  const lead = h.meanLeadDays;
  return (
    <>
      <Private>
        <div
          className="flex h-3.5 gap-0.5 overflow-hidden rounded-[5px] bg-slate-100"
          role="img"
          aria-label={segs.map((s) => `${s.label} ${s.n}`).join(', ')}
        >
          {segs.map((s) =>
            s.n > 0 ? (
              <span
                key={s.label}
                className={s.cls}
                style={{ flex: s.n }}
                title={`${s.label}: ${s.n}`}
              />
            ) : null
          )}
        </div>
      </Private>
      <div className="grid grid-cols-2 gap-4">
        {segs.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <b className="text-xl font-bold text-slate-900">
              <Private>{s.n}</Private>
            </b>
            <span className="text-xs text-slate-500">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-700">
        Completion rate{' '}
        <b className="text-slate-900">
          <Private>{fmtPct(h.completionRate)}</Private>
        </b>
      </div>
      <div className="text-xs text-slate-700">
        Typically submits{' '}
        <b className="text-slate-900">
          <Private>
            {lead === null
              ? '—'
              : `${Math.abs(lead).toFixed(1)} days ${lead >= 0 ? 'before' : 'after'}`}
          </Private>
        </b>{' '}
        the due date
      </div>
      <div className="text-xs text-slate-700">
        Quiz retakes{' '}
        <b className="text-slate-900">
          <Private>{h.retakes}</Private>
        </b>
      </div>
    </>
  );
};

export const StandardsCard: React.FC<{
  rows: (TargetRow & { target: AnalysisTarget | null })[];
  scale: ProficiencyScale;
  method: ProficiencyMethod;
}> = ({ rows, scale, method }) => {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="text-xs text-slate-500">
        {[
          METHOD_LABEL[method],
          ...bandRanges(scale)
            .slice(0, -1)
            .map(({ style, range }) => `${style.name} ${range}`),
        ].join(' · ')}
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-500">No tagged work yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {['Target', 'Level', 'Evidence over time', ''].map((h, i) => (
                  <th key={i} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const band = bandFor(r.pct, scale);
                const code = r.target?.code ?? r.targetId;
                const label =
                  r.target && r.target.label !== r.target.code
                    ? r.target.label
                    : '';
                return (
                  <React.Fragment key={r.targetId}>
                    <tr>
                      <td className={TD}>
                        <b>{code}</b> {label}
                      </td>
                      <td className={TD}>
                        {band && (
                          <Private>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${LEVEL_BADGE[band.level]}`}
                            >
                              {band.name}
                              {r.pct === null ? '' : ` · ${Math.round(r.pct)}`}
                            </span>
                          </Private>
                        )}
                      </td>
                      <td className={TD}>
                        <Private>
                          <div className="flex flex-wrap gap-1">
                            {r.evidence.map((e, i) => {
                              const b = bandFor(e.pct, scale);
                              return (
                                <span
                                  key={i}
                                  title={`${e.title}: ${Math.round(e.pct)}% (${b?.name ?? ''})`}
                                  className={`grid h-7 w-[34px] place-items-center rounded-md text-[11px] font-bold ${b?.cell ?? ''}`}
                                >
                                  {Math.round(e.pct)}
                                </span>
                              );
                            })}
                          </div>
                        </Private>
                      </td>
                      <td className={TD}>
                        <button
                          type="button"
                          aria-expanded={open === r.targetId}
                          {...tourFieldAttr(
                            'gradebook.student.evidence',
                            'gradebook',
                            r.targetId
                          )}
                          onClick={() =>
                            setOpen(open === r.targetId ? null : r.targetId)
                          }
                          className="rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {open === r.targetId ? 'Hide' : 'Evidence'}
                        </button>
                      </td>
                    </tr>
                    {open === r.targetId && (
                      <tr>
                        <td colSpan={4} className={`${TD} text-xs`}>
                          {r.evidence.map((e, i) => (
                            <div key={i}>
                              {e.title} ({shortDate(e.at)}):{' '}
                              <b>
                                <Private>{Math.round(e.pct)}%</Private>
                              </b>
                              {` on ${code} questions`}
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export const CompareCard: React.FC<StudentCardProps> = ({
  studentUid,
  first,
}) => {
  const gb = useGradebook();
  const { getCell } = gb;
  const uids = useMemo(() => gb.students.map((s) => s.uid), [gb.students]);
  const rows = useMemo(
    () => comparisonRows(gb.columns, getCell, studentUid, uids, gb.now),
    [gb.columns, getCell, studentUid, uids, gb.now]
  );
  return (
    <>
      <div className="text-xs text-slate-500">
        Each gray dot is a classmate (no names). The blue dot is{' '}
        <Private>{first}</Private>.
      </div>
      <DistributionStrip
        rows={rows.map((r) => ({
          id: r.sessionId,
          label: r.title,
          title: r.title,
          values: r.classmates,
          mark: r.excused ? null : r.pct,
          text: <Private>{r.excused ? 'Excused' : fmtPct(r.pct)}</Private>,
        }))}
      />
    </>
  );
};

export const InsightsCard: React.FC<{ insights: GradebookInsight[] }> = ({
  insights,
}) => {
  const { rosterId } = useGradebook();
  return (
    <InsightList
      insights={insights}
      onSelect={(i) => {
        if (i.targetId) spaNavigate(buildGradebookPath(rosterId, 'analysis'));
      }}
    />
  );
};

export const AssignmentsCard: React.FC<{ studentUid: string }> = ({
  studentUid,
}) => {
  const gb = useGradebook();
  const flagDefs = new Map(gb.settings.flags.map((f) => [f.id, f]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {['Assignment', 'Due', 'Score', 'Flags', 'Comment', ''].map(
              (h, i) => (
                <th key={i} className={TH}>
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {gb.columns.map((col) => {
            const cell = gb.getCell(col.sessionId, studentUid);
            const f = cell.final;
            const comment = cell.mark?.comment ?? null;
            return (
              <tr key={col.sessionId}>
                <td className={TD}>
                  <span className="inline-flex items-center gap-1.5">
                    <KindIcon kind={col.kind} />
                    {col.title}
                  </span>
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {shortDate(col.dueAt)}
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  <Private>
                    {f.status === 'not-assigned' ? (
                      'Not assigned'
                    ) : col.completionOnly ? (
                      f.status === 'complete' ? (
                        '✓'
                      ) : (
                        '—'
                      )
                    ) : f.status === 'awaiting' ? (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 ring-inset">
                        Needs grading
                      </span>
                    ) : f.status === 'empty' ? (
                      '—'
                    ) : (
                      <>
                        {formatScore(f, gb.view.cellFormat)}
                        {!cell.published && (
                          <span className="ml-1 text-xs font-semibold text-amber-700">
                            not published
                          </span>
                        )}
                      </>
                    )}
                  </Private>
                </td>
                <td className={TD}>
                  <span className="flex flex-wrap gap-1">
                    {f.flags.map((fl) => {
                      const def = flagDefs.get(fl.id);
                      if (!def) return null;
                      return (
                        <span
                          key={fl.id}
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${flagChipClasses(def.color, fl.auto)}`}
                        >
                          {def.name}
                          {fl.auto ? ' · auto' : ''}
                        </span>
                      );
                    })}
                  </span>
                </td>
                <td className={`${TD} text-xs`}>
                  {comment && (
                    <>
                      <Private>{comment.text}</Private>
                      {comment.shared && (
                        <span className="ml-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 ring-1 ring-slate-200 ring-inset">
                          shared
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className={TD}>
                  <button
                    type="button"
                    data-gb-cell={cellAnchorId(col.sessionId, studentUid)}
                    {...tourFieldAttr(
                      'gradebook.student.edit-cell',
                      'gradebook',
                      col.sessionId
                    )}
                    onClick={() => gb.openCell(col.sessionId, studentUid)}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const KindIcon: React.FC<{ kind: keyof typeof GRADEBOOK_KIND_META }> = ({
  kind,
}) => {
  const meta = GRADEBOOK_KIND_META[kind];
  const Icon = meta.icon;
  return (
    <Icon
      size={14}
      className="flex-none text-slate-400"
      aria-label={meta.label}
    />
  );
};

const LEVEL_BADGE = [
  'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'bg-amber-50 text-amber-700 ring-amber-200',
  'bg-rose-50 text-rose-700 ring-rose-200',
] as const;

const TH =
  'border-b border-slate-200 bg-slate-50 p-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const TD = 'border-b border-slate-100 px-2 py-2.5 align-middle text-slate-700';
