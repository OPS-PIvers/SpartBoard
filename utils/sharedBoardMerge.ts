import type {
  Dashboard,
  DrawableObject,
  WidgetConnection,
  WidgetData,
} from '@/types';
import { mergeWidget } from '@/utils/dashboardSaveMerge';
import { mergeAnnotationObjects } from '@/utils/annotationMerge';
import { stableStringify } from '@/utils/stableStringify';
import { scrubWidgetsPII } from '@/utils/dashboardPII';

/** The shared doc as this device last received it: the base for telling its own edits from a co-teacher's. */
export interface SharedBoardBaseline {
  widgets: WidgetData[];
  background: Dashboard['background'] | undefined;
  settings: Dashboard['settings'];
  globalStyle: Dashboard['globalStyle'];
  annotationObjects: DrawableObject[];
  /** Connections without Runs: a Run belongs to the device carrying it out. */
  connections: WidgetConnection[];
}

/** A board's Connections with Runs cleared, the form a share carries them in. */
export const sharedConnections = (
  d: Pick<Dashboard, 'connections'>
): WidgetConnection[] =>
  (d.connections ?? []).map((c) => {
    if (c.kind !== 'sequence' || !('run' in c)) return c;
    const { run: _run, ...rest } = c;
    return rest;
  });

export const sharedBoardBaseline = (d: Dashboard): SharedBoardBaseline => ({
  widgets: d.widgets,
  background: d.background,
  settings: d.settings,
  globalStyle: d.globalStyle,
  annotationObjects: d.annotationOverlay?.objects ?? [],
  connections: sharedConnections(d),
});

/**
 * Three-way merge of a Synced board's Connections by id, like its widgets:
 * this device's edits, adds and deletes stand, everything else takes the share.
 * Without a base (first snapshot here) the share wins. This device's Runs stay.
 * A host keeps its own Connections then, so a share an old client damaged heals.
 */
export function mergeSharedConnections(
  local: Pick<Dashboard, 'connections'>,
  server: Pick<Dashboard, 'connections'>,
  base: Pick<SharedBoardBaseline, 'connections'> | undefined,
  /** Without a base, also keep local Connections the share lacks (a host's own board). */
  keepLocalWithoutBase = false
): WidgetConnection[] {
  const localDefs = sharedConnections(local);
  const serverDefs = sharedConnections(server);
  const merged: WidgetConnection[] = [];
  if (!base) {
    merged.push(...serverDefs);
    if (keepLocalWithoutBase) {
      const serverIds = new Set(serverDefs.map((c) => c.id));
      merged.push(...localDefs.filter((c) => !serverIds.has(c.id)));
    }
  } else {
    const localById = new Map(localDefs.map((c) => [c.id, c]));
    const baseById = new Map(base.connections.map((c) => [c.id, c]));
    const serverIds = new Set(serverDefs.map((c) => c.id));
    for (const sc of serverDefs) {
      const lc = localById.get(sc.id);
      const bc = baseById.get(sc.id);
      if (!lc) {
        if (!bc) merged.push(sc); // added by a co-teacher
        continue; // removed here
      }
      const changedHere = !bc || stableStringify(lc) !== stableStringify(bc);
      merged.push(changedHere ? lc : sc);
    }
    for (const lc of localDefs) {
      if (serverIds.has(lc.id)) continue;
      if (!baseById.has(lc.id)) merged.push(lc); // added here, not on the share yet
    }
  }
  // Kept as this device had it, `run: null` included, so an idle Sequence never reads as changed.
  const runs = new Map(
    (local.connections ?? []).flatMap((c) =>
      c.kind === 'sequence' && 'run' in c ? [[c.id, c.run] as const] : []
    )
  );
  return merged.map((c) =>
    c.kind === 'sequence' && runs.has(c.id) ? { ...c, run: runs.get(c.id) } : c
  );
}

const sharedConfig = (w: WidgetData): string =>
  stableStringify(scrubWidgetsPII([w])[0].config);

const withoutVersion = (w: WidgetData): WidgetData => {
  const { version: _version, ...rest } = w;
  return rest;
};

// Config is compared by content: two teachers' concurrent edits reach the same `version`.
const mergeSharedWidget = (
  local: WidgetData,
  server: WidgetData,
  base: WidgetData
): WidgetData => {
  const merged = mergeWidget(
    withoutVersion(local),
    server,
    withoutVersion(base)
  );
  if (local.version === undefined && server.version === undefined) {
    return withoutVersion(merged);
  }
  // A merged config the share lacks gets a newer version, or the mirror never sends it.
  const version =
    sharedConfig(merged) === sharedConfig(server)
      ? server.version
      : Math.max(local.version ?? 0, server.version ?? 0) + 1;
  return version === undefined
    ? withoutVersion(merged)
    : { ...merged, version };
};

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
    merged.push(bw ? mergeSharedWidget(lw, sw, bw) : lw);
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
  | 'widgets'
  | 'background'
  | 'settings'
  | 'globalStyle'
  | 'annotationOverlay'
  | 'connections'
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
    connections: mergeSharedConnections(local, server, base),
  };
}
