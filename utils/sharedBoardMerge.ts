import type { Dashboard, DrawableObject, WidgetData } from '@/types';
import { mergeWidget } from '@/utils/dashboardSaveMerge';
import { mergeAnnotationObjects } from '@/utils/annotationMerge';
import { stableStringify } from '@/utils/stableStringify';

/** The shared doc as this device last received it: the base for telling its own edits from a co-teacher's. */
export interface SharedBoardBaseline {
  widgets: WidgetData[];
  background: Dashboard['background'] | undefined;
  settings: Dashboard['settings'];
  globalStyle: Dashboard['globalStyle'];
  annotationObjects: DrawableObject[];
}

export const sharedBoardBaseline = (d: Dashboard): SharedBoardBaseline => ({
  widgets: d.widgets,
  background: d.background,
  settings: d.settings,
  globalStyle: d.globalStyle,
  annotationObjects: d.annotationOverlay?.objects ?? [],
});

/**
 * Three-way widget merge for a Synced board. Widgets this device changed keep
 * their local fields, everything else takes the shared doc, and the result
 * follows the shared doc's order so two devices settle on the same array.
 */
export function mergeSharedWidgets(
  local: WidgetData[],
  server: WidgetData[],
  base: WidgetData[]
): WidgetData[] {
  const localById = new Map(local.map((w) => [w.id, w]));
  const baseById = new Map(base.map((w) => [w.id, w]));
  const serverIds = new Set(server.map((w) => w.id));

  const merged: WidgetData[] = [];
  for (const sw of server) {
    const lw = localById.get(sw.id);
    const bw = baseById.get(sw.id);
    if (!lw) {
      if (!bw) merged.push(sw); // added by a co-teacher
      continue; // removed here
    }
    merged.push(bw ? mergeWidget(lw, sw, bw) : lw);
  }
  for (const lw of local) {
    if (serverIds.has(lw.id)) continue;
    if (!baseById.has(lw.id)) merged.push(lw); // added here, not on the share yet
    // otherwise removed by a co-teacher
  }
  return merged;
}

const pickChanged = <T>(local: T, server: T, base: T): T =>
  stableStringify(local ?? null) !== stableStringify(base ?? null)
    ? local
    : server;

/** The co-edited parts of a Synced board, merged against the last received copy. */
export function mergeSharedBoard(
  local: Dashboard,
  server: Dashboard,
  base: SharedBoardBaseline
): Pick<
  Dashboard,
  'widgets' | 'background' | 'settings' | 'globalStyle' | 'annotationOverlay'
> {
  const localInk = local.annotationOverlay?.objects ?? [];
  const inkChanged =
    stableStringify(localInk) !== stableStringify(base.annotationObjects);
  return {
    widgets: mergeSharedWidgets(local.widgets, server.widgets, base.widgets),
    background:
      pickChanged(local.background, server.background, base.background) ??
      local.background,
    settings: pickChanged(local.settings, server.settings, base.settings),
    globalStyle: pickChanged(
      local.globalStyle,
      server.globalStyle,
      base.globalStyle
    ),
    annotationOverlay:
      inkChanged && local.annotationOverlay
        ? {
            ...local.annotationOverlay,
            objects: mergeAnnotationObjects(
              localInk,
              server.annotationOverlay?.objects ?? [],
              base.annotationObjects
            ),
          }
        : (server.annotationOverlay ?? local.annotationOverlay),
  };
}
