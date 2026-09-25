import { TOOLS } from '@/config/tools';
import { GLOBAL_FEATURES } from '@/components/admin/globalFeatureRows';
import { ROLLOUT_SWITCHES } from '@/config/rolloutSwitches';

export type AccessTabId = 'features' | 'global' | 'rollouts';

export const ACCESS_TAB_LABELS: Record<AccessTabId, string> = {
  features: 'Feature Permissions',
  global: 'Global Settings',
  rollouts: 'Rollouts',
};

/** Every word of the query must appear in one of the fields, case-insensitive. */
export const matchesSearch = (
  query: string,
  fields: readonly (string | undefined)[]
): boolean => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => haystack.includes(w));
};

const ROWS: Record<AccessTabId, readonly (readonly (string | undefined)[])[]> =
  {
    features: TOOLS.map((t) => [t.label, t.type, ...(t.keywords ?? [])]),
    global: GLOBAL_FEATURES.map((f) => [f.label, f.description, f.id]),
    rollouts: ROLLOUT_SWITCHES.map((r) => [r.title, r.description, r.docId]),
  };

/** Matching row count per Access tab, from static metadata so no tab has to mount. */
export const countAccessMatches = (
  query: string
): Record<AccessTabId, number> => ({
  features: ROWS.features.filter((f) => matchesSearch(query, f)).length,
  global: ROWS.global.filter((f) => matchesSearch(query, f)).length,
  rollouts: ROWS.rollouts.filter((f) => matchesSearch(query, f)).length,
});
