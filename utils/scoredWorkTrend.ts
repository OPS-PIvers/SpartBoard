import type { PlcScoredWorkAggregate } from '@/types';

/** Fewer scored students than this makes a percent too thin to act on. */
export const SCORED_WORK_LOW_SAMPLE = 5;

export interface ScoredWorkTrend {
  /** Series oldest first. */
  columns: PlcScoredWorkAggregate[];
  /** Criteria seen in two or more series, with one percent (or null) per column. */
  rows: Array<{ name: string; values: Array<number | null> }>;
}

/** Follow each rubric criterion across the team's series, by name. */
export function buildScoredWorkTrend(
  aggregates: readonly PlcScoredWorkAggregate[]
): ScoredWorkTrend {
  const columns = [...aggregates].sort(
    (a, b) => a.lastPublishedAt - b.lastPublishedAt
  );
  const names = new Map<string, string>();
  for (const agg of columns) {
    for (const c of agg.criteria) {
      const key = c.name.trim().toLowerCase();
      if (!names.has(key)) names.set(key, c.name);
    }
  }
  const rows = [...names.entries()]
    .map(([key, name]) => ({
      name,
      values: columns.map(
        (agg) =>
          agg.criteria.find((c) => c.name.trim().toLowerCase() === key)
            ?.averagePercent ?? null
      ),
    }))
    .filter((row) => row.values.filter((v) => v !== null).length >= 2);
  return { columns, rows };
}
