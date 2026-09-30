import { canonicalizeBuildingIds } from '@/config/buildings';
import type { GradingPeriod, GradingPeriodSetDoc } from './gradebookCore';

export interface GradingPeriodSet extends GradingPeriodSetDoc {
  id: string;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local YYYY-MM-DD for a timestamp, matching how admins enter period dates. */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidPeriod(p: GradingPeriod): boolean {
  return DATE_RE.test(p.start) && DATE_RE.test(p.end) && p.start <= p.end;
}

/** D18: a column belongs to a period by `dueAt`, falling back to `openAt`, then `createdAt`. */
export function columnPeriodDate(col: {
  dueAt?: number | null;
  openAt?: number | null;
  createdAt?: number | null;
}): number | null {
  return col.dueAt ?? col.openAt ?? col.createdAt ?? null;
}

export function inPeriod(ms: number | null, period: GradingPeriod): boolean {
  if (ms === null || !isValidPeriod(period)) return false;
  const key = localDateKey(ms);
  return key >= period.start && key <= period.end;
}

/** The period containing `now`, else the most recent one that has ended, else the first. */
export function currentPeriod(
  periods: readonly GradingPeriod[],
  now: number
): GradingPeriod | null {
  const valid = sortPeriods(periods.filter(isValidPeriod));
  if (!valid.length) return null;
  const today = localDateKey(now);
  return (
    valid.find((p) => today >= p.start && today <= p.end) ??
    [...valid].reverse().find((p) => p.end < today) ??
    valid[0]
  );
}

export function sortPeriods(
  periods: readonly GradingPeriod[]
): GradingPeriod[] {
  return [...periods].sort(
    (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)
  );
}

/** The first set (by name) that targets one of the teacher's buildings. */
export function periodSetForBuildings(
  sets: readonly GradingPeriodSet[],
  buildingIds: readonly string[]
): GradingPeriodSet | null {
  const mine = new Set(canonicalizeBuildingIds(buildingIds));
  return (
    [...sets]
      .sort((a, b) => a.name.localeCompare(b.name))
      .find((s) =>
        canonicalizeBuildingIds(s.buildingIds).some((b) => mine.has(b))
      ) ?? null
  );
}

export function parsePeriodSet(
  id: string,
  raw: Record<string, unknown>
): GradingPeriodSet {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const periods = Array.isArray(raw.periods)
    ? (raw.periods as unknown[]).flatMap((p) => {
        if (!p || typeof p !== 'object') return [];
        const r = p as Record<string, unknown>;
        return [
          {
            id: str(r.id),
            label: str(r.label),
            start: str(r.start),
            end: str(r.end),
          },
        ];
      })
    : [];
  return {
    id,
    name: str(raw.name) || 'Grading periods',
    orgId: str(raw.orgId),
    buildingIds: Array.isArray(raw.buildingIds)
      ? (raw.buildingIds as unknown[]).filter(
          (b): b is string => typeof b === 'string'
        )
      : [],
    periods,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

export const PERIOD_PRESETS: Record<'quarters' | 'semesters', string[]> = {
  quarters: ['Q1', 'Q2', 'Q3', 'Q4'],
  semesters: ['S1', 'S2'],
};
