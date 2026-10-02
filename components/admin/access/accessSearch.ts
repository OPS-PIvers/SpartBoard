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

/** Graduated `keep` previews, read from their saved access docs. */
export type GraduatedSet = ReadonlySet<GlobalFeature>;

const NONE: GraduatedSet = new Set();

/** Permanent in code, or a `keep` preview an admin graduated from the Previews tab. */
export const isPermanentFeature = (
  id: GlobalFeature,
  graduated: GraduatedSet = NONE
): boolean => {
  const def = FEATURE_DEFAULTS[id];
  return (
    def.stage === 'permanent' ||
    (def.afterLaunch === 'keep' && graduated.has(id))
  );
};

export const featuresTabFeatures = (
  graduated: GraduatedSet = NONE
): GlobalFeature[] =>
  ALL_GLOBAL_FEATURES.filter((id) => {
    const def = FEATURE_DEFAULTS[id];
    return isPermanentFeature(id, graduated) && !def.home && !def.widget;
  });

/** Permanent features a widget owns, shown in its config modal or on its Widgets row. */
export const widgetSubFeatures = (
  widget: string,
  graduated: GraduatedSet = NONE
): GlobalFeature[] =>
  ALL_GLOBAL_FEATURES.filter(
    (id) =>
      isPermanentFeature(id, graduated) &&
      FEATURE_DEFAULTS[id].widget === widget
  );

export const widgetSearchFields = (
  tool: { label: string; type: string; keywords?: string[] },
  displayName?: string,
  graduated: GraduatedSet = NONE
): string[] => [
  tool.label,
  displayName ?? '',
  tool.type,
  ...(tool.keywords ?? []),
  ...widgetSubFeatures(tool.type, graduated).flatMap((id) => [
    FEATURE_DEFAULTS[id].label,
    FEATURE_DEFAULTS[id].description,
    id,
  ]),
];

export const previewFeatures = (
  graduated: GraduatedSet = NONE
): GlobalFeature[] =>
  ALL_GLOBAL_FEATURES.filter((id) => !isPermanentFeature(id, graduated));

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
  sw.field ?? '',
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

const rowsFor = (
  graduated: GraduatedSet
): Record<AccessTabId, readonly (readonly (string | undefined)[])[]> => ({
  widgets: TOOLS.map((t) => widgetSearchFields(t, undefined, graduated)),
  features: [
    ...featuresTabFeatures(graduated).map(featureSearchFields),
    ['Gemini models', 'model overrides', 'AI'],
  ],
  previews: [
    ...previewFeatures(graduated).map(featureSearchFields),
    ...ROLLOUT_ONLY_SWITCHES.map(rolloutSearchFields),
  ],
});

/** Matching row count per Access tab, from static metadata so no tab has to mount. */
export const countAccessMatches = (
  query: string,
  graduated: GraduatedSet = NONE
): Record<AccessTabId, number> => {
  const rows = rowsFor(graduated);
  return {
    widgets: rows.widgets.filter((f) => matchesSearch(query, f)).length,
    features: rows.features.filter((f) => matchesSearch(query, f)).length,
    previews: rows.previews.filter((f) => matchesSearch(query, f)).length,
  };
};
