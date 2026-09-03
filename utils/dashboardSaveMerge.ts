import type { Dashboard, WidgetData } from '@/types';
import {
  LAYOUT_FIELDS,
  STYLE_FIELDS,
  anyFieldChanged as anyChanged,
  type MergeFieldKey,
} from '@/utils/widgetMergeFields';

/**
 * The last state this device knew the server to hold, used to tell its own
 * edits apart from another device's. Widgets here must be PII-scrubbed the
 * same way the saved document is, or every un-versioned widget carrying a
 * roster would read as locally changed on every save.
 */
export interface SaveBaseline {
  widgets: WidgetData[];
  background: string;
  name: string;
  libraryOrder: string;
  settings: string;
}

const configChanged = (a: WidgetData, b: WidgetData) =>
  a.version !== undefined && b.version !== undefined
    ? a.version !== b.version
    : JSON.stringify(a.config) !== JSON.stringify(b.config);

const pick = (w: WidgetData, fields: readonly MergeFieldKey[]) => {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = w[f];
  return out as Partial<WidgetData>;
};

const mergeWidget = (
  local: WidgetData,
  server: WidgetData,
  base: WidgetData
): WidgetData => ({
  ...local,
  ...(configChanged(local, base)
    ? {}
    : { config: server.config, version: server.version }),
  ...(anyChanged(local, base, LAYOUT_FIELDS)
    ? {}
    : pick(server, LAYOUT_FIELDS)),
  ...(anyChanged(local, base, STYLE_FIELDS) ? {} : pick(server, STYLE_FIELDS)),
  ...(JSON.stringify(local.annotation) === JSON.stringify(base.annotation)
    ? { annotation: server.annotation }
    : {}),
});

/** Fold a newer server copy into the local board so a save never overwrites edits this device has not seen. */
export function mergeDashboardForSave(
  local: Dashboard,
  server: Dashboard,
  baseline: SaveBaseline
): Dashboard {
  const serverById = new Map(server.widgets.map((w) => [w.id, w]));
  const baseById = new Map(baseline.widgets.map((w) => [w.id, w]));
  const localIds = new Set(local.widgets.map((w) => w.id));

  const widgets: WidgetData[] = [];
  for (const lw of local.widgets) {
    const sw = serverById.get(lw.id);
    const bw = baseById.get(lw.id);
    if (!sw) {
      if (!bw) widgets.push(lw); // added here, not yet on the server
      continue; // deleted on another device
    }
    widgets.push(bw ? mergeWidget(lw, sw, bw) : lw);
  }
  for (const sw of server.widgets) {
    if (!localIds.has(sw.id) && !baseById.has(sw.id)) widgets.push(sw); // added elsewhere
  }

  return {
    ...local,
    widgets,
    background:
      local.background !== baseline.background
        ? local.background
        : server.background,
    name: local.name !== baseline.name ? local.name : server.name,
    libraryOrder:
      JSON.stringify(local.libraryOrder ?? []) !== baseline.libraryOrder
        ? local.libraryOrder
        : server.libraryOrder,
    settings:
      JSON.stringify(local.settings ?? {}) !== baseline.settings
        ? local.settings
        : server.settings,
  };
}
