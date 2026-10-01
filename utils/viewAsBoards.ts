// View as board working copy and pending changes (docs/plans/ADMIN_VIEW_AS.md D11, D12).
import type { Dashboard, WidgetData } from '@/types';
import { LAYOUT_FIELDS, STYLE_FIELDS } from '@/utils/widgetMergeFields';
import { scrubWidgetsPII } from '@/utils/dashboardPII';
import { stableStringify } from '@/utils/stableStringify';

export type PendingKind = 'layout' | 'config';

export interface PendingChange {
  key: string;
  boardId: string;
  boardName: string;
  widgetId: string;
  widget: WidgetData;
  kind: PendingKind;
  /** Changed top-level widget fields; a key missing from one side means absent. */
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  /** The widget (or its board) is gone from their latest board, so it can't be approved. */
  stale: boolean;
}

type FieldPatch = Record<string, unknown>;
type LocalWriter = (
  boardId: string,
  widgetId: string,
  patch: FieldPatch
) => void;

interface WorkingCopyState {
  /** Their board as this tab last adopted it, plus any approved fields. */
  baselines: ReadonlyMap<string, Dashboard>;
  /** Their latest board from the listener. */
  server: ReadonlyMap<string, Dashboard>;
  /** This tab's boards (the working copy). */
  local: readonly Dashboard[];
}

let state: WorkingCopyState = {
  baselines: new Map(),
  server: new Map(),
  local: [],
};
let writer: LocalWriter | null = null;
const listeners = new Set<() => void>();

const emit = (next: WorkingCopyState) => {
  state = next;
  listeners.forEach((l) => l());
};

export const getViewAsWorkingCopy = (): WorkingCopyState => state;

export function subscribeViewAsWorkingCopy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishViewAsLocalBoards(local: readonly Dashboard[]): void {
  if (local !== state.local) emit({ ...state, local });
}

/** DashboardContext registers how Discard puts a field back on the working copy. */
export function registerViewAsLocalWriter(next: LocalWriter | null): void {
  writer = next;
}

export function resetViewAsWorkingCopy(): void {
  writer = null;
  emit({ baselines: new Map(), server: new Map(), local: [] });
}

const comparableBoard = (d: Dashboard): string =>
  stableStringify({
    ...d,
    widgets: scrubWidgetsPII(d.widgets.filter((w) => !w.transient)).map(
      ({ x: _x, y: _y, w: _w, h: _h, version: _v, ...rest }) => rest
    ),
  });

/**
 * Snapshot reconcile for the view-as tab: a board with no local edits follows
 * their latest copy; an edited board keeps the working copy. Boards added or
 * deleted in the tab stay that way (D12).
 */
export function reconcileViewAsSnapshot(
  serverBoards: Dashboard[],
  local: readonly Dashboard[]
): Dashboard[] {
  const localById = new Map(local.map((d) => [d.id, d]));
  const baselines = new Map(state.baselines);
  const server = new Map(serverBoards.map((d) => [d.id, d]));
  const next: Dashboard[] = [];
  for (const s of serverBoards) {
    const l = localById.get(s.id);
    const base = baselines.get(s.id);
    if (base && !l) continue;
    if (!l || !base || comparableBoard(l) === comparableBoard(base)) {
      baselines.set(s.id, s);
      next.push(s);
    } else {
      next.push(l);
    }
  }
  for (const l of local) {
    if (!server.has(l.id) && !baselines.has(l.id)) next.push(l);
  }
  for (const id of Array.from(baselines.keys())) {
    if (!server.has(id)) baselines.delete(id);
  }
  emit({ ...state, baselines, server });
  return next;
}

const scrubbedConfig = (w: WidgetData): unknown =>
  scrubWidgetsPII([w])[0].config;

const pickChanged = (
  base: WidgetData,
  local: WidgetData,
  fields: readonly string[]
): { before: FieldPatch; after: FieldPatch } => {
  const before: FieldPatch = {};
  const after: FieldPatch = {};
  const b = base as unknown as FieldPatch;
  const l = local as unknown as FieldPatch;
  for (const f of fields) {
    if (stableStringify(b[f]) === stableStringify(l[f])) continue;
    if (b[f] !== undefined) before[f] = b[f];
    if (l[f] !== undefined) after[f] = l[f];
  }
  return { before, after };
};

const hasKeys = (a: FieldPatch, b: FieldPatch) =>
  Object.keys(a).length > 0 || Object.keys(b).length > 0;

/** D11: layout and config edits to widgets on both sides become pending items; everything else stays local. */
export function diffViewAsBoards(s: WorkingCopyState): PendingChange[] {
  const out: PendingChange[] = [];
  for (const board of s.local) {
    const base = s.baselines.get(board.id);
    if (!base) continue;
    const baseById = new Map(base.widgets.map((w) => [w.id, w]));
    const latest = s.server.get(board.id);
    const latestIds = new Set(latest?.widgets.map((w) => w.id) ?? []);
    for (const widget of board.widgets) {
      if (widget.transient) continue;
      const before = baseById.get(widget.id);
      if (!before) continue;
      const stale = !latestIds.has(widget.id);
      const layout = pickChanged(before, widget, LAYOUT_FIELDS);
      if (hasKeys(layout.before, layout.after)) {
        out.push({
          key: `${board.id}/${widget.id}/layout`,
          boardId: board.id,
          boardName: board.name,
          widgetId: widget.id,
          widget,
          kind: 'layout',
          ...layout,
          stale,
        });
      }
      const style = pickChanged(before, widget, STYLE_FIELDS);
      const beforeConfig = scrubbedConfig(before);
      const afterConfig = scrubbedConfig(widget);
      if (stableStringify(beforeConfig) !== stableStringify(afterConfig)) {
        style.before.config = beforeConfig;
        style.after.config = afterConfig;
      }
      if (hasKeys(style.before, style.after)) {
        out.push({
          key: `${board.id}/${widget.id}/config`,
          boardId: board.id,
          boardName: board.name,
          widgetId: widget.id,
          widget,
          kind: 'config',
          ...style,
          stale,
        });
      }
    }
  }
  return out;
}

const fieldsOf = (change: PendingChange): string[] =>
  Array.from(
    new Set([...Object.keys(change.before), ...Object.keys(change.after)])
  );

const patchFrom = (change: PendingChange, side: FieldPatch): FieldPatch => {
  const patch: FieldPatch = {};
  for (const f of fieldsOf(change)) patch[f] = side[f];
  return patch;
};

/** After an approve, their copy holds `after`, so the item drops out of the diff. */
export function markViewAsChangeApproved(change: PendingChange): void {
  const base = state.baselines.get(change.boardId);
  if (!base) return;
  const patch = patchFrom(change, change.after);
  if (change.kind === 'config' && 'config' in patch) {
    // Keep PII fields from the baseline so the scrubbed copy doesn't read as a change.
    patch.config = change.widget.config;
  }
  if (change.kind === 'config') patch.version = change.widget.version;
  const baselines = new Map(state.baselines);
  baselines.set(change.boardId, {
    ...base,
    widgets: base.widgets.map((w) =>
      w.id === change.widgetId ? ({ ...w, ...patch } as WidgetData) : w
    ),
  });
  emit({ ...state, baselines });
}

/** Discard: put the working copy's fields back to what their board held. */
export function discardViewAsChange(change: PendingChange): void {
  const base = state.baselines
    .get(change.boardId)
    ?.widgets.find((w) => w.id === change.widgetId);
  if (!base || !writer) return;
  const fields =
    change.kind === 'layout'
      ? [...fieldsOf(change), 'x', 'y', 'w', 'h']
      : fieldsOf(change);
  const b = base as unknown as FieldPatch;
  const patch: FieldPatch = {};
  for (const f of fields) patch[f] = b[f];
  if (change.kind === 'config') patch.version = base.version;
  writer(change.boardId, change.widgetId, patch);
}
