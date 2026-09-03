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
  /** JSON of each DASHBOARD_FIELDS value as this device last saw it. */
  dashboardFields: Partial<Record<MergedDashboardField, string>>;
}

/**
 * Board-level fields the merge resolves against the baseline, on top of
 * `widgets`/`background`/`name`/`libraryOrder`/`settings`, which have their own
 * baseline entries because the snapshot merge shares them. Several of these are
 * written by targeted `updateDoc` calls (pinBoard, moveBoardToCollection) or by
 * the reorder batch, so a stale autosave would otherwise revert them.
 *
 * Deliberately absent, and last-write-wins from the local copy: `viewportWidth`
 * and `viewportHeight` (device-local — each device records its own, and
 * adopting another's would mis-scale the proportional layout);
 * `annotationOverlay` (the live-share mirror owns that path); and the immutable
 * `id`/`createdAt` plus the write's own `updatedAt`.
 */
export const DASHBOARD_FIELDS = [
  'driveFileId',
  'thumbnailUrl',
  'globalStyle',
  'sharedGroups',
  'isDefault',
  'order',
  'collectionId',
  'isPinned',
  'linkedShareId',
  'linkedShareRole',
  'linkedShareHostName',
  'linkedShareEnded',
] as const;

export type MergedDashboardField = (typeof DASHBOARD_FIELDS)[number];

/** `undefined` and `null` must serialize alike so an absent field isn't a change. */
export const serializeDashboardField = (value: unknown): string =>
  JSON.stringify(value ?? null);

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

  const merged: Dashboard = {
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

  // Same rule as the four above: a field this device hasn't touched since its
  // last save takes the server value. A field missing from the baseline keeps
  // local, so an older baseline can never discard an edit.
  const writable = merged as unknown as Record<string, unknown>;
  for (const field of DASHBOARD_FIELDS) {
    const base = baseline.dashboardFields[field];
    if (base === undefined) continue;
    if (serializeDashboardField(local[field]) === base) {
      writable[field] = server[field];
    }
  }

  return merged;
}
