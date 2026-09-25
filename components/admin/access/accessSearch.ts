import { TOOLS } from '@/config/tools';
import {
  ALL_GLOBAL_FEATURES,
  FEATURE_DEFAULTS,
} from '@/config/featureDefaults';
import { ROLLOUT_SWITCHES, type RolloutSwitch } from '@/config/rolloutSwitches';
import type { GlobalFeature } from '@/types';

export type AccessTabId = 'widgets' | 'features' | 'previews';

export const ACCESS_TAB_LABELS: Record<AccessTabId, string> = {
  widgets: 'Widgets',
  features: 'Features',
  previews: 'Previews',
};

export const FEATURES_TAB_FEATURES = ALL_GLOBAL_FEATURES.filter((id) => {
  const def = FEATURE_DEFAULTS[id];
  return def.stage === 'permanent' && !def.home && !def.widget;
});

/** Permanent features a widget owns, shown as switches on its Widgets row (plan PR 4). */
export const widgetSubFeatures = (widget: string): GlobalFeature[] =>
  ALL_GLOBAL_FEATURES.filter(
    (id) =>
      FEATURE_DEFAULTS[id].stage === 'permanent' &&
      FEATURE_DEFAULTS[id].widget === widget
  );

export const widgetSearchFields = (
  tool: { label: string; type: string; keywords?: string[] },
  displayName?: string
): string[] => [
  tool.label,
  displayName ?? '',
  tool.type,
  ...(tool.keywords ?? []),
  ...widgetSubFeatures(tool.type).flatMap((id) => [
    FEATURE_DEFAULTS[id].label,
    FEATURE_DEFAULTS[id].description,
    id,
  ]),
];

export const PREVIEW_FEATURES = ALL_GLOBAL_FEATURES.filter(
  (id) => FEATURE_DEFAULTS[id].stage === 'preview'
);

export const switchForFeature = (
  id: GlobalFeature
): RolloutSwitch | undefined =>
  ROLLOUT_SWITCHES.find((sw) => sw.feature === id);

/** District switches with no access flag of their own. */
export const ROLLOUT_ONLY_SWITCHES = ROLLOUT_SWITCHES.filter(
  (sw) => !sw.feature
);

export const featureSearchFields = (id: GlobalFeature): string[] => {
  const def = FEATURE_DEFAULTS[id];
  const sw = switchForFeature(id);
  return [def.label, def.description, id, sw?.title ?? '', sw?.docId ?? ''];
};

export const rolloutSearchFields = (sw: RolloutSwitch): string[] => [
  sw.title,
  sw.description,
  sw.docId,
];

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
    widgets: TOOLS.map((t) => widgetSearchFields(t)),
    features: [
      ...FEATURES_TAB_FEATURES.map(featureSearchFields),
      ['Gemini models', 'model overrides', 'AI'],
    ],
    previews: [
      ...PREVIEW_FEATURES.map(featureSearchFields),
      ...ROLLOUT_ONLY_SWITCHES.map(rolloutSearchFields),
    ],
  };

/** Matching row count per Access tab, from static metadata so no tab has to mount. */
export const countAccessMatches = (
  query: string
): Record<AccessTabId, number> => ({
  widgets: ROWS.widgets.filter((f) => matchesSearch(query, f)).length,
  features: ROWS.features.filter((f) => matchesSearch(query, f)).length,
  previews: ROWS.previews.filter((f) => matchesSearch(query, f)).length,
});
