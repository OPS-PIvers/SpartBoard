import {
  combineEvidence,
  computeOverall,
  evidenceForCell,
  proficiencyLevel,
  type FinalScore,
  type GradebookCategory,
  type GradebookColumnConfig,
  type GradebookKind,
  type GradebookMark,
  type GradeIndexRow,
  type OverallCell,
  type ProficiencyLevel,
  type ProficiencyMethod,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';

/** The slice of the grid's column the student view reads. */
export interface SvColumn {
  sessionId: string;
  kind: GradebookKind;
  title: string;
  dueAt: number | null;
  sortAt: number;
  max: number | null;
  config: GradebookColumnConfig | null;
  categoryId: string;
  completionOnly: boolean;
}

export interface SvCell {
  row: GradeIndexRow | null;
  mark: GradebookMark | null;
  final: FinalScore;
  published: boolean;
}

export type SvCellGetter = (sessionId: string, studentUid: string) => SvCell;

export const STUDENT_CARD_IDS = [
  'performance',
  'habits',
  'standards',
  'compare',
  'insights',
  'assignments',
] as const;
export type StudentCardId = (typeof STUDENT_CARD_IDS)[number];

export const STUDENT_CARD_LAYOUT_KEY = 'student';
export const STUDENT_CARD_HIDDEN_KEY = 'student-hidden';

const DAY_MS = 86_400_000;

const isCardId = (id: string): id is StudentCardId =>
  (STUDENT_CARD_IDS as readonly string[]).includes(id);

/** Saved order with unknown ids dropped and new cards appended. */
export function resolveCardOrder(saved: string[] | undefined): StudentCardId[] {
  const out: StudentCardId[] = [];
  for (const id of saved ?? []) {
    if (isCardId(id) && !out.includes(id)) out.push(id);
  }
  for (const id of STUDENT_CARD_IDS) if (!out.includes(id)) out.push(id);
  return out;
}

export function moveCard(
  order: StudentCardId[],
  id: StudentCardId,
  delta: -1 | 1
): StudentCardId[] {
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const byDate = (a: SvColumn, b: SvColumn): number => a.sortAt - b.sortAt;

const countedPct = (final: FinalScore): number | null =>
  final.status === 'scored' && final.counts ? final.pct : null;

const hasFlag = (final: FinalScore, id: string): boolean =>
  final.flags.some((f) => f.id === id);

function overallCell(col: SvColumn, final: FinalScore): OverallCell {
  return {
    final,
    category: col.categoryId,
    countsTowardOverall: col.config?.countsTowardOverall ?? true,
  };
}

export interface CategoryGrade {
  id: string;
  name: string;
  weight: number;
  pct: number | null;
}

export function categoryGrades(
  columns: SvColumn[],
  getCell: SvCellGetter,
  studentUid: string,
  categories: GradebookCategory[]
): CategoryGrade[] {
  const firstId = categories[0]?.id;
  const known = new Set(categories.map((c) => c.id));
  return categories.map((cat) => {
    const cells = columns
      .filter(
        (c) => (known.has(c.categoryId) ? c.categoryId : firstId) === cat.id
      )
      .map((c) => overallCell(c, getCell(c.sessionId, studentUid).final));
    return { ...cat, pct: computeOverall(cells, false, []).pct };
  });
}

export interface TrendPoint {
  sessionId: string;
  title: string;
  at: number;
  pct: number | null;
  /** The score came from a flag value (Missing counted as 0). */
  fromFlag: boolean;
  median: number | null;
}

export function trendPoints(
  columns: SvColumn[],
  getCell: SvCellGetter,
  studentUid: string,
  classUids: string[]
): TrendPoint[] {
  return columns
    .filter((c) => !c.completionOnly)
    .sort(byDate)
    .map((c) => {
      const final = getCell(c.sessionId, studentUid).final;
      const others = classUids
        .map((u) => countedPct(getCell(c.sessionId, u).final))
        .filter((v): v is number => v !== null);
      return {
        sessionId: c.sessionId,
        title: c.title,
        at: c.dueAt ?? c.sortAt,
        pct: countedPct(final),
        fromFlag: final.source === 'flag',
        median: median(others),
      };
    });
}

export interface WhatIfInput {
  categoryId: string;
  points: number;
  max: number;
}

/** D26 what-if: the overall grade with one more scored assignment added. */
export function whatIfOverall(
  columns: SvColumn[],
  getCell: SvCellGetter,
  studentUid: string,
  categoriesEnabled: boolean,
  categories: GradebookCategory[],
  extra: WhatIfInput
): number | null {
  if (extra.max <= 0) return null;
  const points = Math.min(Math.max(extra.points, 0), extra.max);
  const cells = columns.map((c) =>
    overallCell(c, getCell(c.sessionId, studentUid).final)
  );
  cells.push({
    final: {
      status: 'scored',
      points,
      max: extra.max,
      pct: (points / extra.max) * 100,
      source: 'raw',
      flagId: null,
      rawPoints: points,
      flags: [],
      counts: true,
    },
    category: extra.categoryId,
    countsTowardOverall: true,
  });
  return computeOverall(cells, categoriesEnabled, categories).pct;
}

export interface TargetEvidenceItem {
  sessionId: string;
  title: string;
  pct: number;
  at: number;
}

export interface TargetRow {
  targetId: string;
  label: string;
  pct: number | null;
  level: ProficiencyLevel | null;
  evidence: TargetEvidenceItem[];
}

export function standardsRows(
  columns: SvColumn[],
  getCell: SvCellGetter,
  studentUid: string,
  method: ProficiencyMethod,
  scale: ProficiencyScale,
  labelFor: (targetId: string) => string
): TargetRow[] {
  const byTarget = new Map<string, TargetEvidenceItem[]>();
  for (const c of [...columns].sort(byDate)) {
    const cell = getCell(c.sessionId, studentUid);
    for (const e of evidenceForCell(cell.row, cell.final, c.config)) {
      const list = byTarget.get(e.targetId) ?? [];
      list.push({
        sessionId: c.sessionId,
        title: c.title,
        pct: e.pct,
        at: e.at,
      });
      byTarget.set(e.targetId, list);
    }
  }
  return [...byTarget.entries()]
    .map(([targetId, evidence]) => {
      const pct = combineEvidence(evidence, method);
      return {
        targetId,
        label: labelFor(targetId),
        pct,
        level: proficiencyLevel(pct, scale),
        evidence,
      };
    })
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true })
    );
}

export interface WorkHabits {
  onTime: number;
  late: number;
  missing: number;
  excused: number;
  /** Percent of due work turned in, on time or late; null with nothing due. */
  completionRate: number | null;
  /** Mean days submitted before the due date; negative means after. */
  meanLeadDays: number | null;
  retakes: number;
}

export function workHabits(
  columns: SvColumn[],
  getCell: SvCellGetter,
  studentUid: string,
  now: number
): WorkHabits {
  const out: WorkHabits = {
    onTime: 0,
    late: 0,
    missing: 0,
    excused: 0,
    completionRate: null,
    meanLeadDays: null,
    retakes: 0,
  };
  const leads: number[] = [];
  for (const c of columns) {
    const { row, final } = getCell(c.sessionId, studentUid);
    if (final.status === 'not-assigned') continue;
    if (row && row.attempts.length > 1) out.retakes++;
    if (c.dueAt === null || c.dueAt > now) continue;
    const submittedAt = row?.submittedAt ?? null;
    if (submittedAt !== null) leads.push((c.dueAt - submittedAt) / DAY_MS);
    if (final.status === 'excluded') out.excused++;
    else if (hasFlag(final, 'missing')) out.missing++;
    else if (hasFlag(final, 'late')) out.late++;
    else if (submittedAt !== null) out.onTime++;
  }
  const due = out.onTime + out.late + out.missing;
  out.completionRate = due > 0 ? ((out.onTime + out.late) / due) * 100 : null;
  out.meanLeadDays = leads.length
    ? leads.reduce((s, v) => s + v, 0) / leads.length
    : null;
  return out;
}

export interface ComparisonRow {
  sessionId: string;
  title: string;
  classmates: number[];
  pct: number | null;
  excused: boolean;
}

/** Scored, due columns with classmates' counted percents; no names leave this function. */
export function comparisonRows(
  columns: SvColumn[],
  getCell: SvCellGetter,
  studentUid: string,
  classUids: string[],
  now: number
): ComparisonRow[] {
  return columns
    .filter((c) => !c.completionOnly && (c.dueAt === null || c.dueAt <= now))
    .sort(byDate)
    .map((c) => {
      const final = getCell(c.sessionId, studentUid).final;
      return {
        sessionId: c.sessionId,
        title: c.title,
        classmates: classUids
          .filter((u) => u !== studentUid)
          .map((u) => countedPct(getCell(c.sessionId, u).final))
          .filter((v): v is number => v !== null),
        pct: countedPct(final),
        excused: final.status === 'excluded',
      };
    })
    .filter((r) => r.classmates.length > 0 || r.pct !== null);
}

/** Count of targets at the top level, and of targets with any evidence. */
export function proficientCount(rows: TargetRow[]): {
  proficient: number;
  total: number;
} {
  return {
    proficient: rows.filter((r) => r.level === 0).length,
    total: rows.length,
  };
}
