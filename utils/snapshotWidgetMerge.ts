import type { WidgetData } from '@/types';
import { mergeConfigByKey } from '@/utils/dashboardSaveMerge';
import { stableStringify } from '@/utils/stableStringify';
import {
  INSTANCE_FIELDS,
  LAYOUT_FIELDS,
  STYLE_FIELDS,
} from '@/utils/widgetMergeFields';
import { withLaterUse } from '@/utils/widgetUse';

const pickFields = (
  w: WidgetData,
  fields: readonly string[]
): Partial<WidgetData> => {
  const acc: Record<string, unknown> = {};
  for (const f of fields) acc[f] = w[f as keyof WidgetData];
  return acc;
};

// Field groups changed locally since `saved` keep local, the rest take the server's; also returns the baseline to record.
export function mergeSnapshotWidget(
  lw: WidgetData,
  sw: WidgetData,
  saved: WidgetData | undefined,
  keepLocalIfServerLacks: ReadonlySet<string>
): { widget: WidgetData; baseline: WidgetData } {
  if (!saved) {
    return {
      widget: {
        ...sw,
        version: sw.version,
        config: sw.config,
        configVersion: sw.configVersion,
        ...withLaterUse(lw, sw),
      },
      baseline: sw,
    };
  }

  const keepLocalConfig =
    lw.version !== undefined && saved.version !== undefined
      ? lw.version !== saved.version
      : stableStringify(lw.config) !== stableStringify(saved.config);
  const keepLocalLayout = LAYOUT_FIELDS.some((f) => lw[f] !== saved[f]);
  const keepLocalStyle = STYLE_FIELDS.some((f) => lw[f] !== saved[f]);
  const keepLocalInstance = INSTANCE_FIELDS.some((f) => lw[f] !== saved[f]);
  // Key-stable, or a reordered-but-unchanged echo reads as a local edit and clobbers a genuine remote stroke.
  const keepLocalAnnotation = (() => {
    const la = lw.annotation;
    const sa = saved.annotation;
    if (la === sa) return false;
    if (!la || !sa) return true;
    if (la.mode !== sa.mode) return true;
    if ((la.paths?.length ?? 0) !== (sa.paths?.length ?? 0)) return true;
    return stableStringify(la) !== stableStringify(sa);
  })();

  const configMerge = keepLocalConfig
    ? mergeConfigByKey(
        lw.config,
        sw.config,
        saved.config,
        keepLocalIfServerLacks
      )
    : null;

  const widget: WidgetData = {
    ...sw,
    version: keepLocalConfig ? lw.version : sw.version,
    config: configMerge ? configMerge.config : sw.config,
    configVersion: keepLocalConfig ? lw.configVersion : sw.configVersion,
    ...(keepLocalLayout
      ? {
          ...pickFields(lw, LAYOUT_FIELDS),
          // Pixels are derived from the proportions kept above; taking sw's would paint the stale server size until the next hydration.
          x: lw.x,
          y: lw.y,
          w: lw.w,
          h: lw.h,
        }
      : {}),
    ...(keepLocalStyle ? pickFields(lw, STYLE_FIELDS) : {}),
    ...(keepLocalInstance ? pickFields(lw, INSTANCE_FIELDS) : {}),
    ...(keepLocalAnnotation ? { annotation: lw.annotation } : {}),
    ...withLaterUse(lw, sw),
  };

  const baseline: WidgetData = {
    ...sw,
    version: keepLocalConfig ? saved.version : sw.version,
    config: configMerge ? configMerge.baseline : sw.config,
    configVersion: keepLocalConfig ? saved.configVersion : sw.configVersion,
    ...(keepLocalLayout ? pickFields(saved, LAYOUT_FIELDS) : {}),
    ...(keepLocalStyle ? pickFields(saved, STYLE_FIELDS) : {}),
    ...(keepLocalInstance ? pickFields(saved, INSTANCE_FIELDS) : {}),
    ...(keepLocalAnnotation ? { annotation: saved.annotation } : {}),
  };

  return { widget, baseline };
}

const versionOf = (w: WidgetData) => w.version ?? 1;

// With own writes pending, local wins except widgets another device moved to a higher version, and adds unless `addsFrom` is null or knows the id; null when nothing is newer.
export function mergePendingSnapshotWidgets(
  local: readonly WidgetData[],
  server: readonly WidgetData[],
  saved: readonly WidgetData[],
  addsFrom: { knownIds: ReadonlySet<string> } | null,
  keepLocalIfServerLacks: ReadonlySet<string>
): { widgets: WidgetData[]; baselineWidgets: WidgetData[] } | null {
  const serverById = new Map(server.map((w) => [w.id, w]));
  const savedById = new Map(saved.map((w) => [w.id, w]));
  const localIds = new Set(local.map((w) => w.id));
  const adoptedBaselines = new Map<string, WidgetData>();

  const widgets = local.map((lw) => {
    const sw = serverById.get(lw.id);
    const sv = savedById.get(lw.id);
    if (!sw || !sv) return lw;
    if (versionOf(sw) <= Math.max(versionOf(lw), versionOf(sv))) return lw;
    const merged = mergeSnapshotWidget(lw, sw, sv, keepLocalIfServerLacks);
    adoptedBaselines.set(lw.id, merged.baseline);
    return merged.widget;
  });

  const added = addsFrom
    ? server.filter(
        (sw) =>
          !localIds.has(sw.id) &&
          !savedById.has(sw.id) &&
          !addsFrom.knownIds.has(sw.id)
      )
    : [];

  if (adoptedBaselines.size === 0 && added.length === 0) return null;

  return {
    widgets: [...widgets, ...added],
    baselineWidgets: [
      ...saved.map((w) => adoptedBaselines.get(w.id) ?? w),
      ...added,
    ],
  };
}
