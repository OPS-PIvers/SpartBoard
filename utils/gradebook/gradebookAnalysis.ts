import {
  combineEvidence,
  evidenceForCell,
  type FinalScore,
  type GradebookColumnConfig,
  type GradebookKind,
  type GradebookTargetTag,
  type GradeIndexRow,
  type ProficiencyMethod,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';

/** The slice of a grid column the analysis reads (structurally a `GradebookColumn`). */
export interface AnalysisColumn {
  sessionId: string;
  kind: GradebookKind;
  title: string;
  sortAt: number;
  categoryId: string;
  completionOnly: boolean;
  ungradedCount: number;
  config: GradebookColumnConfig | null;
}

export interface AnalysisStudent {
  uid: string;
  /** Roster `Student.id`, which roster groups and accommodations key on. */
  studentId: string;
  name: string;
}

export interface AnalysisCell {
  row: GradeIndexRow | null;
  final: FinalScore;
}

export interface AnalysisData {
  students: AnalysisStudent[];
  /** Oldest first. */
  columns: AnalysisColumn[];
  cell(sessionId: string, uid: string): AnalysisCell;
  overallPct(uid: string): number | null;
}

export interface AnalysisTarget {
  id: string;
  /** Short name for headers ("RL.1"). */
  code: string;
  label: string;
}

export const MISSING_FLAG_ID = 'missing';

export function mean(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function formatPct(p: number | null): string {
  return p === null ? '–' : `${Math.round(p)}%`;
}

/** A cell's percent when it enters an average (awaiting, excused and empty cells do not). */
export function countedPct(final: FinalScore): number | null {
  return final.status === 'scored' && final.counts ? final.pct : null;
}

export function isMissing(final: FinalScore): boolean {
  return final.flags.some((f) => f.id === MISSING_FLAG_ID);
}

export function hasFlag(final: FinalScore, flagId: string): boolean {
  return final.flags.some((f) => f.id === flagId);
}

export interface HistogramBin {
  min: number;
  /** Exclusive; Infinity for the top bin. */
  max: number;
  label: string;
  count: number;
}

const BASE_EDGES = [0, 50, 60, 70, 80, 90];

/** Fixed bins, split at the scale's cutoffs so no bin straddles two levels. */
export function histogramBins(
  values: number[],
  scale: ProficiencyScale
): HistogramBin[] {
  const edges = [
    ...new Set([...BASE_EDGES, scale.approaching, scale.proficient]),
  ]
    .filter((e) => e >= 0 && e < 100)
    .sort((a, b) => a - b);
  return edges.map((min, i) => {
    const max = i + 1 < edges.length ? edges[i + 1] : Infinity;
    return {
      min,
      max,
      label: max === Infinity ? `${min}+` : `${min}–${max}`,
      count: values.filter((v) => v >= min && v < max).length,
    };
  });
}

/** Column- and question-level target ids a column carries evidence for. */
export function columnTargetIds(
  column: AnalysisColumn,
  data: AnalysisData
): Set<string> {
  const ids = new Set((column.config?.targets ?? []).map((t) => t.id));
  for (const s of data.students) {
    const row = data.cell(column.sessionId, s.uid).row;
    for (const e of row?.targetEvidence ?? []) ids.add(e.targetId);
  }
  return ids;
}

/** Every target any column has evidence for, labelled from tags or the lookup. */
export function collectTargets(
  data: AnalysisData,
  lookup: (id: string) => GradebookTargetTag | undefined
): AnalysisTarget[] {
  const tags = new Map<string, GradebookTargetTag>();
  for (const c of data.columns) {
    for (const t of c.config?.targets ?? []) tags.set(t.id, t);
  }
  const ids = new Set<string>();
  for (const c of data.columns) {
    for (const id of columnTargetIds(c, data)) ids.add(id);
  }
  return [...ids]
    .map((id) => {
      const tag = tags.get(id) ?? lookup(id);
      const code = tag?.code ?? fallbackCode(id);
      return { id, code, label: tag?.label ?? code };
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

export function targetName(t: AnalysisTarget): string {
  return t.label && t.label !== t.code ? `${t.code} ${t.label}` : t.code;
}

function fallbackCode(id: string): string {
  const i = id.lastIndexOf(':');
  return i >= 0 ? id.slice(i + 1) : id;
}

/** D17 proficiency per target for one student over the given columns. */
export function studentProficiency(
  data: AnalysisData,
  columns: AnalysisColumn[],
  uid: string,
  method: ProficiencyMethod
): Map<string, number> {
  const byTarget = new Map<string, { pct: number; at: number }[]>();
  for (const c of columns) {
    const { row, final } = data.cell(c.sessionId, uid);
    for (const e of evidenceForCell(row, final, c.config)) {
      const list = byTarget.get(e.targetId) ?? [];
      list.push({ pct: e.pct, at: e.at });
      byTarget.set(e.targetId, list);
    }
  }
  const out = new Map<string, number>();
  for (const [id, pts] of byTarget) {
    const v = combineEvidence(pts, method);
    if (v !== null) out.set(id, v);
  }
  return out;
}

export type ProficiencyTable = Map<string, Map<string, number>>;

export function proficiencyTable(
  data: AnalysisData,
  columns: AnalysisColumn[],
  method: ProficiencyMethod
): ProficiencyTable {
  return new Map(
    data.students.map((s) => [
      s.uid,
      studentProficiency(data, columns, s.uid, method),
    ])
  );
}

export interface AnalysisFilter {
  category: string;
  kind: string;
  target: string;
  group: string;
  flag: string;
  accommodation: 'all' | 'yes' | 'no';
}

export const EMPTY_ANALYSIS_FILTER: AnalysisFilter = {
  category: 'all',
  kind: 'all',
  target: 'all',
  group: 'all',
  flag: 'all',
  accommodation: 'all',
};

export interface RosterFacts {
  groups: { id: string; name: string; studentIds: string[] }[];
  accommodatedIds: Set<string>;
}

/** Scored columns the filter keeps; completion-only columns never enter the analysis. */
export function filterColumns(
  data: AnalysisData,
  filter: AnalysisFilter
): AnalysisColumn[] {
  return data.columns.filter(
    (c) =>
      !c.completionOnly &&
      (filter.category === 'all' || c.categoryId === filter.category) &&
      (filter.kind === 'all' || c.kind === filter.kind) &&
      (filter.target === 'all' || columnTargetIds(c, data).has(filter.target))
  );
}

export function filterStudents(
  data: AnalysisData,
  filter: AnalysisFilter,
  roster: RosterFacts
): AnalysisStudent[] {
  const group =
    filter.group === 'all'
      ? null
      : new Set(
          roster.groups.find((g) => g.id === filter.group)?.studentIds ?? []
        );
  return data.students.filter(
    (s) =>
      (!group || group.has(s.studentId)) &&
      (filter.accommodation === 'all' ||
        (filter.accommodation === 'yes') ===
          roster.accommodatedIds.has(s.studentId)) &&
      (filter.flag === 'all' ||
        data.columns.some((c) =>
          hasFlag(data.cell(c.sessionId, s.uid).final, filter.flag)
        ))
  );
}

export function missingColumns(
  data: AnalysisData,
  columns: AnalysisColumn[],
  uid: string
): AnalysisColumn[] {
  return columns.filter((c) => isMissing(data.cell(c.sessionId, uid).final));
}

export function columnAverage(
  data: AnalysisData,
  column: AnalysisColumn,
  students: AnalysisStudent[]
): number | null {
  return mean(
    students.map((s) => countedPct(data.cell(column.sessionId, s.uid).final))
  );
}

export type ExploreMetric = 'avg' | 'missing' | 'top';
export type ExploreBy = 'assignment' | 'kind' | 'category' | 'target' | 'group';

export interface ExploreRow {
  id: string;
  label: string;
  value: number;
  text: string;
  /** Bar width, 0-100. */
  width: number;
}

export interface ExploreInput {
  data: AnalysisData;
  students: AnalysisStudent[];
  columns: AnalysisColumn[];
  metric: ExploreMetric;
  by: ExploreBy;
  scale: ProficiencyScale;
  proficiency: ProficiencyTable;
  targets: AnalysisTarget[];
  categories: { id: string; name: string }[];
  groups: RosterFacts['groups'];
  kindLabel(kind: GradebookKind): string;
}

/** D27 Explore pivot: one metric grouped one way, as bar rows. */
export function explore(input: ExploreInput): ExploreRow[] {
  const { data, students, columns, metric, by, scale } = input;
  interface Group {
    id: string;
    label: string;
    columns: AnalysisColumn[];
    students: AnalysisStudent[];
    target?: string;
  }
  let groups: Group[] = [];
  if (by === 'assignment') {
    groups = columns.map((c) => ({
      id: c.sessionId,
      label: c.title,
      columns: [c],
      students,
    }));
  } else if (by === 'kind') {
    groups = [...new Set(columns.map((c) => c.kind))].map((k) => ({
      id: k,
      label: input.kindLabel(k),
      columns: columns.filter((c) => c.kind === k),
      students,
    }));
  } else if (by === 'category') {
    groups = input.categories.map((cat) => ({
      id: cat.id,
      label: cat.name,
      columns: columns.filter((c) => c.categoryId === cat.id),
      students,
    }));
  } else if (by === 'group') {
    groups = input.groups.map((g) => {
      const ids = new Set(g.studentIds);
      return {
        id: g.id,
        label: g.name,
        columns,
        students: students.filter((s) => ids.has(s.studentId)),
      };
    });
  } else {
    groups = input.targets.map((t) => ({
      id: t.id,
      label: targetName(t),
      columns: columns.filter((c) => columnTargetIds(c, data).has(t.id)),
      students,
      target: t.id,
    }));
  }
  const rows = groups.map((g) => {
    const finals = g.students.flatMap((s) =>
      g.columns.map((c) => data.cell(c.sessionId, s.uid).final)
    );
    if (metric === 'missing') {
      const n = finals.filter(isMissing).length;
      return { id: g.id, label: g.label, value: n, text: String(n) };
    }
    const values =
      g.target && metric === 'top'
        ? g.students.map(
            (s) => input.proficiency.get(s.uid)?.get(g.target as string) ?? null
          )
        : finals.map(countedPct);
    if (metric === 'avg') {
      const v = mean(values);
      return { id: g.id, label: g.label, value: v ?? 0, text: formatPct(v) };
    }
    const scored = values.filter((x): x is number => x !== null);
    const share = scored.length
      ? (scored.filter((x) => x >= scale.proficient).length / scored.length) *
        100
      : 0;
    return {
      id: g.id,
      label: g.label,
      value: share,
      text: `${Math.round(share)}%`,
    };
  });
  const top = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => ({
    ...r,
    width: metric === 'missing' ? (r.value / top) * 100 : r.value,
  }));
}
