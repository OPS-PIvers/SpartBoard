import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { CellPopover } from '@/components/admin/Organization/components/primitives';
import { Private } from '@/components/gradebook/Private';
import {
  BarList,
  ProficiencyHeatmap,
  ScoreHistogram,
} from '@/components/gradebook/charts';
import {
  topCutoff,
  type GradebookKind,
  type ProficiencyMethod,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import {
  EMPTY_ANALYSIS_FILTER,
  columnAverage,
  explore,
  filterColumns,
  filterStudents,
  formatPct,
  mean,
  median,
  missingColumns,
  proficiencyTable,
  targetName,
  type AnalysisData,
  type AnalysisFilter,
  type AnalysisTarget,
  type ExploreBy,
  type ExploreMetric,
  type RosterFacts,
} from '@/utils/gradebook/gradebookAnalysis';
import {
  buildInsights,
  type GradebookInsight,
} from '@/utils/gradebook/gradebookInsights';
import { InsightList } from './InsightList';
import { AnalysisCard, AnalysisSelect, Kpi } from './AnalysisCard';

export interface AnalysisCompare {
  /** The other class's short name ("Period 4"). */
  label: string;
  on: boolean;
  setOn: (on: boolean) => void;
  /** Other rosters to pick from when there is more than one. */
  options?: { id: string; label: string }[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Assignment average in the other class, by session id; null while loading. */
  averages: Map<string, number | null> | null;
}

export interface GradebookAnalysisViewProps {
  data: AnalysisData;
  roster: RosterFacts;
  categories: { id: string; name: string }[];
  flags: { id: string; name: string }[];
  kinds: { id: GradebookKind; label: string }[];
  method: ProficiencyMethod;
  scale: ProficiencyScale;
  targets: AnalysisTarget[];
  /** Accommodations are hidden while privacy is on (D32). */
  privacy: boolean;
  compare: AnalysisCompare | null;
  onOpenStudent: (uid: string) => void;
  onAnalyze: (sessionId: string) => void;
  onGrade: (sessionId: string) => void;
}

const selectCls = 'h-9 w-full text-sm';
const lblCls = 'text-xs font-semibold uppercase tracking-wide text-slate-700';

export const GradebookAnalysisView: React.FC<GradebookAnalysisViewProps> = ({
  data,
  roster,
  categories,
  flags,
  kinds,
  method,
  scale,
  targets,
  privacy,
  compare,
  onOpenStudent,
  onAnalyze,
  onGrade,
}) => {
  const [picked, setFilter] = useState<AnalysisFilter>(EMPTY_ANALYSIS_FILTER);
  const filter: AnalysisFilter = useMemo(
    () => (privacy ? { ...picked, accommodation: 'all' } : picked),
    [privacy, picked]
  );
  const [metric, setMetric] = useState<ExploreMetric>('avg');
  const [by, setBy] = useState<ExploreBy>('assignment');
  const [menuOpen, setMenuOpen] = useState(false);
  const filtersRef = useRef<HTMLButtonElement>(null);
  const top = scale.levels[0].name;

  const students = useMemo(
    () => filterStudents(data, filter, roster),
    [data, filter, roster]
  );
  const columns = useMemo(() => filterColumns(data, filter), [data, filter]);
  const proficiency = useMemo(
    () => proficiencyTable(data, columns, method),
    [data, columns, method]
  );
  const shownTargets =
    filter.target === 'all'
      ? targets
      : targets.filter((t) => t.id === filter.target);

  const overalls = students.map((s) => data.overallPct(s.uid));
  const missingBy = students
    .map((s) => ({ s, cols: missingColumns(data, columns, s.uid) }))
    .filter((x) => x.cols.length > 0)
    .sort((a, b) => b.cols.length - a.cols.length);
  const missingTotal = missingBy.reduce((n, x) => n + x.cols.length, 0);
  const allTop = students.filter((s) =>
    targets.every((t) => {
      const p = proficiency.get(s.uid)?.get(t.id);
      return p === undefined || p >= topCutoff(scale);
    })
  ).length;

  const insights = useMemo(
    () =>
      buildInsights({
        data,
        students,
        columns,
        assessmentCategoryId: categories[0]?.id ?? null,
        targets,
        proficiency,
        scale,
      }),
    [data, students, columns, categories, targets, proficiency, scale]
  );

  const activeCount = (Object.keys(filter) as (keyof AnalysisFilter)[]).filter(
    (k) => filter[k] !== 'all'
  ).length;

  const set = (patch: Partial<AnalysisFilter>) =>
    setFilter((f) => ({ ...f, ...patch }));

  const onInsight = (i: GradebookInsight) => {
    if (i.studentUid) onOpenStudent(i.studentUid);
    else if (i.targetId) set({ target: i.targetId });
    else if (i.sessionId) onGrade(i.sessionId);
  };

  const exploreRows = explore({
    data,
    students,
    columns,
    metric,
    by,
    scale,
    proficiency,
    targets,
    categories,
    groups: roster.groups,
    kindLabel: (k) => kinds.find((x) => x.id === k)?.label ?? k,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={filtersRef}
          type="button"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className={`inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-semibold shadow-sm ${menuOpen ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
        >
          Filters
          {activeCount > 0 && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-blue-primary px-1 text-[11px] font-bold text-white">
              {activeCount}
            </span>
          )}
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter(EMPTY_ANALYSIS_FILTER)}
            className="text-xs font-semibold text-brand-blue-primary hover:underline"
          >
            Clear
          </button>
        )}
        {compare && (
          <>
            <span aria-hidden className="mx-1 h-5 w-px bg-slate-200" />
            <span className="inline-flex items-center gap-2 text-[13px] text-slate-700">
              <Toggle
                size="xs"
                showLabels={false}
                checked={compare.on}
                onChange={compare.setOn}
                label={`Compare with ${compare.label}`}
              />
              {compare.options && compare.options.length > 1 ? (
                <>
                  <span>Compare with</span>
                  <AnalysisSelect
                    aria-label="Class to compare"
                    value={compare.selectedId}
                    onChange={(e) => compare.onSelect?.(e.target.value)}
                    className="h-8 text-[13px]"
                  >
                    {compare.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </AnalysisSelect>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => compare.setOn(!compare.on)}
                >
                  Compare with {compare.label}
                </button>
              )}
            </span>
          </>
        )}
        <span className="flex-1" />
        <span className="text-xs text-slate-500">
          {students.length} students · {columns.length} assignments
        </span>
      </div>

      <CellPopover
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={filtersRef}
        className="w-[300px] !p-4"
      >
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-2">
            <span className={lblCls}>Category</span>
            <AnalysisSelect
              wrapClassName="w-full"
              className={selectCls}
              value={filter.category}
              onChange={(e) => set({ category: e.target.value })}
            >
              <option value="all">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </AnalysisSelect>
          </label>
          <label className="flex flex-col gap-2">
            <span className={lblCls}>Activity type</span>
            <AnalysisSelect
              wrapClassName="w-full"
              className={selectCls}
              value={filter.kind}
              onChange={(e) => set({ kind: e.target.value })}
            >
              <option value="all">All</option>
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </AnalysisSelect>
          </label>
          <label className="flex flex-col gap-2">
            <span className={lblCls}>Learning target</span>
            <AnalysisSelect
              wrapClassName="w-full"
              className={selectCls}
              value={filter.target}
              onChange={(e) => set({ target: e.target.value })}
            >
              <option value="all">All</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {targetName(t)}
                </option>
              ))}
            </AnalysisSelect>
          </label>
          <label className="flex flex-col gap-2">
            <span className={lblCls}>Roster group</span>
            <AnalysisSelect
              wrapClassName="w-full"
              className={selectCls}
              value={filter.group}
              onChange={(e) => set({ group: e.target.value })}
            >
              <option value="all">All</option>
              {roster.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </AnalysisSelect>
          </label>
          <label className="flex flex-col gap-2">
            <span className={lblCls}>Flag</span>
            <AnalysisSelect
              wrapClassName="w-full"
              className={selectCls}
              value={filter.flag}
              onChange={(e) => set({ flag: e.target.value })}
            >
              <option value="all">Any</option>
              {flags.map((f) => (
                <option key={f.id} value={f.id}>
                  Has {f.name}
                </option>
              ))}
            </AnalysisSelect>
          </label>
          {!privacy && (
            <label className="flex flex-col gap-2">
              <span className={lblCls}>Accommodations</span>
              <AnalysisSelect
                wrapClassName="w-full"
                className={selectCls}
                title="Screen only. Never exported."
                value={filter.accommodation}
                onChange={(e) =>
                  set({
                    accommodation: e.target
                      .value as AnalysisFilter['accommodation'],
                  })
                }
              >
                <option value="all">Any</option>
                <option value="yes">With</option>
                <option value="no">Without</option>
              </AnalysisSelect>
            </label>
          )}
        </div>
      </CellPopover>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
        <Kpi
          value={<Private>{formatPct(mean(overalls))}</Private>}
          label="Class average"
        />
        <Kpi
          value={<Private>{formatPct(median(overalls))}</Private>}
          label="Median"
        />
        <Kpi value={<Private>{missingTotal}</Private>} label="Missing items" />
        <Kpi
          value={
            <Private>
              {students.length
                ? `${Math.round((allTop / students.length) * 100)}%`
                : '0%'}
            </Private>
          }
          label={`${top} on every target`}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <AnalysisCard title="Overall grade distribution">
          <ScoreHistogram
            values={overalls.filter((v): v is number => v !== null)}
            scale={scale}
            ariaLabel="Distribution of overall grades"
            height={280}
          />
        </AnalysisCard>
        <AnalysisCard title="Needs attention">
          <InsightList insights={insights} onSelect={onInsight} />
        </AnalysisCard>
        <AnalysisCard title="Standards heatmap" wide>
          <ProficiencyHeatmap
            scale={scale}
            columns={shownTargets.map((t) => ({
              id: t.id,
              label: t.code,
              title: t.label,
            }))}
            rows={students.map((s) => ({
              id: s.uid,
              label: <Private>{s.name}</Private>,
              cells: shownTargets.map(
                (t) => proficiency.get(s.uid)?.get(t.id) ?? null
              ),
            }))}
            footer
            onSelectRow={onOpenStudent}
            wrapValue={(n) => <Private>{n}</Private>}
          />
        </AnalysisCard>
        <AnalysisCard
          title="Assignment averages"
          aside={
            compare?.on ? (
              <span className="text-xs font-normal text-slate-500">
                · light bar: {compare.label}
              </span>
            ) : null
          }
        >
          <BarList
            rows={columns.map((c) => ({
              id: c.sessionId,
              label: c.title,
              title: c.title,
              value: columnAverage(data, c, students),
              text: (
                <Private>{formatPct(columnAverage(data, c, students))}</Private>
              ),
              compare: compare?.on
                ? (compare.averages?.get(c.sessionId) ?? null)
                : undefined,
            }))}
            compareLabel={compare?.label}
            onSelect={onAnalyze}
            empty="No scored assignments."
          />
        </AnalysisCard>
        <AnalysisCard title="Missing work">
          <BarList
            rows={missingBy.map(({ s, cols }) => ({
              id: s.uid,
              label: <Private>{s.name}</Private>,
              value: null,
              detail: cols.map((c) => c.title).join(', '),
              text: (
                <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                  <Private>{cols.length}</Private>
                </span>
              ),
            }))}
            onSelect={onOpenStudent}
            empty="No missing work."
          />
        </AnalysisCard>
        <AnalysisCard
          title="Explore"
          wide
          aside={
            <>
              <span className="flex-1" />
              <AnalysisSelect
                aria-label="Metric"
                value={metric}
                onChange={(e) => setMetric(e.target.value as ExploreMetric)}
                className="h-[30px] text-xs font-semibold"
              >
                <option value="avg">Average score</option>
                <option value="missing">Missing count</option>
                <option value="top">% at {top}</option>
              </AnalysisSelect>
              <AnalysisSelect
                aria-label="Group by"
                value={by}
                onChange={(e) => setBy(e.target.value as ExploreBy)}
                className="h-[30px] text-xs font-semibold"
              >
                <option value="assignment">by assignment</option>
                <option value="kind">by activity type</option>
                <option value="category">by category</option>
                <option value="target">by target</option>
                <option value="group">by roster group</option>
              </AnalysisSelect>
            </>
          }
        >
          <BarList
            rows={exploreRows.map((r) => ({
              id: r.id,
              label: r.label,
              title: r.label,
              value: r.width,
              text: <Private>{r.text}</Private>,
            }))}
            empty="No data for this view."
          />
        </AnalysisCard>
      </div>
    </div>
  );
};
