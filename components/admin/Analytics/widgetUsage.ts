import { canonicalBuildingId } from '@/config/buildings';

export interface WidgetUserRow {
  email: string;
  // 0 when the teacher has the widget but no use is recorded yet.
  lastUsedMs: number;
}

export interface WidgetUsage {
  daily: number;
  monthly: number;
  dailyPrev: number | null;
  monthlyPrev: number | null;
  buildings: Record<string, number>;
  users: WidgetUserRow[];
}

/** Percent change from `prev`, or null when there is nothing to compare with. */
export const percentChange = (
  current: number,
  prev: number | null | undefined
): number | null => {
  if (prev === null || prev === undefined || prev <= 0) return null;
  return Math.round(((current - prev) / prev) * 100);
};

export const formatChange = (pct: number): string =>
  pct > 0 ? `+${pct}%` : `${pct}%`;

/** Merges legacy building ids into their canonical ids. */
export const foldUsageBuildings = (
  buildings: Record<string, number>
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [rawId, count] of Object.entries(buildings)) {
    const id = rawId === 'none' ? 'none' : canonicalBuildingId(rawId);
    out[id] = (out[id] ?? 0) + count;
  }
  return out;
};

/** Building ids with any widget users, in the org's building order, with 'none' last. */
export const usageBuildingColumns = (
  usage: Record<string, WidgetUsage> | undefined,
  orgOrder: string[]
): string[] => {
  if (!usage) return [];
  const seen = new Set<string>();
  for (const u of Object.values(usage)) {
    for (const [id, n] of Object.entries(u.buildings)) if (n > 0) seen.add(id);
  }
  const rank = (id: string) => {
    if (id === 'none') return Number.MAX_SAFE_INTEGER;
    const i = orgOrder.indexOf(id);
    return i === -1 ? orgOrder.length : i;
  };
  return [...seen].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};
