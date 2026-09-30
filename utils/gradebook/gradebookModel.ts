// Pure grid model for the teacher gradebook (docs/plans/GRADEBOOK.md D18-D20).

import type { Student } from '@/types';
import {
  isCompletionOnly,
  isPublishedFor,
  type FinalScore,
  type GradebookColumnConfig,
  type GradebookKind,
  type GradebookMark,
  type GradebookSettingsBody,
  type GradebookSort,
  type GradeIndexRow,
  type GradingPeriod,
} from './gradebookCore';

export interface GradebookColumn {
  sessionId: string;
  kind: GradebookKind;
  title: string;
  dueAt: number | null;
  closeAt: number | null;
  /** dueAt, then openAt, then createdAt (D18). */
  sortAt: number;
  max: number | null;
  config: GradebookColumnConfig | null;
  categoryId: string;
  completionOnly: boolean;
  hasUnpublished: boolean;
  ungradedCount: number;
  hidden: boolean;
}

export type NameFormat = 'last-first' | 'first-last';
export type CellFormat = 'percent' | 'points';

/** Marks per write batch: each history entry's getAfter is a rules access, capped at 20 per batch. */
export const GRADEBOOK_MARK_BATCH = 8;

export const DEFAULT_GRADEBOOK_SORT: GradebookSort = {
  key: 'last',
  dir: 'asc',
  ref: null,
};

function mostCommon(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  let best = values[0];
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > (counts.get(best) ?? 0)) best = v;
  }
  return best;
}

/** One column per session, oldest to newest (D19). */
export function buildColumns(
  rows: readonly GradeIndexRow[],
  configs: ReadonlyMap<string, GradebookColumnConfig>,
  marks: ReadonlyMap<string, GradebookMark>,
  rosterId: string,
  settings: Pick<GradebookSettingsBody, 'categories'>
): GradebookColumn[] {
  const bySession = new Map<string, GradeIndexRow[]>();
  for (const r of rows) {
    const list = bySession.get(r.sessionId);
    if (list) list.push(r);
    else bySession.set(r.sessionId, [r]);
  }
  const categoryIds = new Set(settings.categories.map((c) => c.id));
  const firstCategory = settings.categories[0]?.id ?? '';
  const out: GradebookColumn[] = [];
  for (const [sessionId, list] of bySession) {
    const head = list.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
    const config = configs.get(sessionId) ?? null;
    const completionOnly = isCompletionOnly(head.kind);
    let hasUnpublished = false;
    let ungradedCount = 0;
    for (const r of list) {
      if (!r.assigned) continue;
      if (r.state === 'awaiting-grade') ungradedCount++;
      const mark = marks.get(`${r.sessionId}__${r.studentUid}`) ?? null;
      if (
        !completionOnly &&
        (r.state === 'scored' || mark?.override) &&
        !isPublishedFor(r, mark)
      ) {
        hasUnpublished = true;
      }
    }
    const rowMaxes = list
      .map((r) => r.max)
      .filter((m): m is number => typeof m === 'number' && m > 0);
    out.push({
      sessionId,
      kind: head.kind,
      title: head.title,
      dueAt: head.dueAt,
      closeAt: head.closeAt,
      sortAt: head.dueAt ?? head.openAt ?? head.createdAt,
      max: config?.maxPointsOverride ?? mostCommon(rowMaxes),
      config,
      categoryId:
        config?.category && categoryIds.has(config.category)
          ? config.category
          : firstCategory,
      completionOnly,
      hasUnpublished,
      ungradedCount,
      hidden: config?.hiddenInRosterIds.includes(rosterId) ?? false,
    });
  }
  return out.sort(
    (a, b) => a.sortAt - b.sortAt || a.title.localeCompare(b.title)
  );
}

/** Local calendar date, YYYY-MM-DD. */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function periodForDate(
  periods: readonly GradingPeriod[],
  ms: number
): GradingPeriod | null {
  const key = localDateKey(ms);
  return periods.find((p) => p.start <= key && key <= p.end) ?? null;
}

/** A column belongs to a period by its sortAt date (D18); null means all periods. */
export function columnInPeriod(
  column: Pick<GradebookColumn, 'sortAt'>,
  period: GradingPeriod | null
): boolean {
  if (!period) return true;
  const key = localDateKey(column.sortAt);
  return period.start <= key && key <= period.end;
}

export function studentName(
  s: Pick<Student, 'firstName' | 'lastName'>,
  format: NameFormat
): string {
  const first = s.firstName.trim();
  const last = s.lastName.trim();
  if (!last) return first;
  if (!first) return last;
  return format === 'last-first' ? `${last}, ${first}` : `${first} ${last}`;
}

export interface SortableStudent {
  uid: string;
  firstName: string;
  lastName: string;
}

export interface SortLookups {
  overall: (uid: string) => number | null;
  column: (sessionId: string, uid: string) => number | null;
  missing: (uid: string) => number;
  hasFlag: (flagId: string, uid: string) => number;
  inGroup: (groupId: string, uid: string) => boolean;
}

const cmpName = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

/** D20: empty scores sort last whichever way the column sorts; names break ties. */
export function sortStudents<T extends SortableStudent>(
  list: readonly T[],
  sort: GradebookSort,
  lookups: SortLookups
): T[] {
  const dir = sort.dir === 'desc' ? -1 : 1;
  const byLast = (a: T, b: T): number =>
    cmpName(a.lastName, b.lastName) || cmpName(a.firstName, b.firstName);
  const byFirst = (a: T, b: T): number =>
    cmpName(a.firstName, b.firstName) || cmpName(a.lastName, b.lastName);
  const numeric = (get: (uid: string) => number | null) => (a: T, b: T) => {
    const x = get(a.uid);
    const y = get(b.uid);
    if (x === null && y === null) return byLast(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return dir * (x - y) || byLast(a, b);
  };
  let cmp: (a: T, b: T) => number;
  switch (sort.key) {
    case 'first':
      cmp = (a, b) => dir * byFirst(a, b);
      break;
    case 'overall':
      cmp = numeric(lookups.overall);
      break;
    case 'column':
      cmp = numeric((uid) => (sort.ref ? lookups.column(sort.ref, uid) : null));
      break;
    case 'missing':
      cmp = (a, b) =>
        dir * (lookups.missing(a.uid) - lookups.missing(b.uid)) || byLast(a, b);
      break;
    case 'flag':
      cmp = (a, b) =>
        sort.ref
          ? dir *
              (lookups.hasFlag(sort.ref, a.uid) -
                lookups.hasFlag(sort.ref, b.uid)) || byLast(a, b)
          : byLast(a, b);
      break;
    case 'group':
      cmp = (a, b) => {
        if (!sort.ref) return byLast(a, b);
        const x = lookups.inGroup(sort.ref, a.uid) ? 0 : 1;
        const y = lookups.inGroup(sort.ref, b.uid) ? 0 : 1;
        return dir * (x - y) || byLast(a, b);
      };
      break;
    default:
      cmp = (a, b) => dir * byLast(a, b);
  }
  return [...list].sort(cmp);
}

const trim = (n: number): string => String(Math.round(n * 10) / 10);

/** The cell's number: "85%" or "8.5/10" (D19). */
export function formatScore(final: FinalScore, format: CellFormat): string {
  if (final.pct === null) return '';
  if (format === 'points' && final.points !== null && final.max !== null) {
    return `${trim(final.points)}/${trim(final.max)}`;
  }
  return `${Math.round(final.pct)}%`;
}

export const GRADEBOOK_FLAG_COLORS = [
  'rose',
  'amber',
  'orange',
  'emerald',
  'teal',
  'sky',
  'blue',
  'slate',
] as const;

export type GradebookFlagColor = (typeof GRADEBOOK_FLAG_COLORS)[number];

const FLAG_CHIP: Record<GradebookFlagColor, { solid: string; auto: string }> = {
  rose: {
    solid: 'bg-brand-red-primary text-white',
    auto: 'bg-white text-brand-red-primary ring-brand-red-primary',
  },
  amber: {
    solid: 'bg-amber-600 text-white',
    auto: 'bg-white text-amber-700 ring-amber-600',
  },
  orange: {
    solid: 'bg-orange-600 text-white',
    auto: 'bg-white text-orange-700 ring-orange-600',
  },
  emerald: {
    solid: 'bg-emerald-600 text-white',
    auto: 'bg-white text-emerald-700 ring-emerald-600',
  },
  teal: {
    solid: 'bg-teal-600 text-white',
    auto: 'bg-white text-teal-700 ring-teal-600',
  },
  sky: {
    solid: 'bg-sky-600 text-white',
    auto: 'bg-white text-sky-700 ring-sky-600',
  },
  blue: {
    solid: 'bg-brand-blue-primary text-white',
    auto: 'bg-white text-brand-blue-primary ring-brand-blue-primary',
  },
  slate: {
    solid: 'bg-slate-500 text-white',
    auto: 'bg-white text-slate-600 ring-slate-500',
  },
};

/** Tailwind classes for a flag chip; auto flags are outlined (D15). */
export function flagChipClasses(color: string, auto: boolean): string {
  const c = FLAG_CHIP[color as GradebookFlagColor] ?? FLAG_CHIP.slate;
  return auto ? `ring-[1.5px] ring-inset ${c.auto}` : c.solid;
}

export function average(values: readonly (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
