import type { WidgetData } from '@/types';
import { stableStringify } from '@/utils/stableStringify';

export const WIDGET_HISTORY_LIMIT = 50;
// Rapid updates to the same widget (drag stream, typing) fold into one entry.
export const WIDGET_HISTORY_COALESCE_MS = 1000;

export interface WidgetHistoryEntry {
  before: WidgetData[];
  // Saved widgets once the entry's own edits committed; undo and redo touch only what differs.
  after: WidgetData[];
  coalesceKey: string | null;
  touchedAt: number;
  // Live copies of widgets an undo or redo took off the board, so putting them back keeps later system writes.
  parked?: Map<string, WidgetData>;
}

// Widget id -> config keys the write touched ('all' when it replaced config).
export type WidgetHistoryRefresh = ReadonlyMap<
  string,
  ReadonlySet<string> | 'all'
>;

export interface WidgetHistoryStack {
  undo: WidgetHistoryEntry[];
  redo: WidgetHistoryEntry[];
}

export const createWidgetHistoryStack = (): WidgetHistoryStack => ({
  undo: [],
  redo: [],
});

/** Push `before` as an undo entry; returns true when a new entry was created. */
export function recordWidgetHistory(
  stack: WidgetHistoryStack,
  before: WidgetData[],
  coalesceKey: string | null,
  now: number = Date.now()
): boolean {
  const top = stack.undo[stack.undo.length - 1];
  // Same synchronous batch already captured this state.
  if (top && top.before === before) {
    top.touchedAt = now;
    stack.redo = [];
    return false;
  }
  if (
    top &&
    coalesceKey !== null &&
    top.coalesceKey === coalesceKey &&
    now - top.touchedAt < WIDGET_HISTORY_COALESCE_MS
  ) {
    top.touchedAt = now;
    stack.redo = [];
    return false;
  }
  stack.undo.push({ before, after: before, coalesceKey, touchedAt: now });
  if (stack.undo.length > WIDGET_HISTORY_LIMIT) {
    stack.undo.splice(0, stack.undo.length - WIDGET_HISTORY_LIMIT);
  }
  stack.redo = [];
  return true;
}

/** Record the committed result of the newest entry's edits; `refresh` limits it to those widgets and config keys. */
export function setWidgetHistoryAfter(
  stack: WidgetHistoryStack,
  committed: WidgetData[],
  refresh?: WidgetHistoryRefresh
): void {
  const top = stack.undo[stack.undo.length - 1];
  if (!top) return;
  if (!refresh) {
    top.after = committed;
    return;
  }
  const committedById = new Map(committed.map((w) => [w.id, w]));
  const after = top.after.flatMap((prev) => {
    const keys = refresh.get(prev.id);
    if (!keys) return [prev];
    const live = committedById.get(prev.id);
    if (!live) return [];
    if (keys === 'all') return [live];
    const config = { ...(prev.config as Fields) };
    const liveConfig = (live.config ?? {}) as Fields;
    for (const k of keys) {
      if (liveConfig[k] === undefined) delete config[k];
      else config[k] = liveConfig[k];
    }
    return [{ ...live, config }];
  });
  const inAfter = new Set(after.map((w) => w.id));
  for (const id of refresh.keys()) {
    const live = committedById.get(id);
    if (live && !inAfter.has(id)) after.push(live);
  }
  top.after = after;
}

// Keeps live copies of the widgets this step is about to take off the board.
const parkRemoved = (
  entry: WidgetHistoryEntry,
  from: WidgetData[],
  to: WidgetData[],
  current: WidgetData[]
): void => {
  const toIds = new Set(to.map((w) => w.id));
  const fromIds = new Set(from.map((w) => w.id));
  for (const live of current) {
    if (fromIds.has(live.id) && !toIds.has(live.id)) {
      entry.parked ??= new Map();
      entry.parked.set(live.id, live);
    }
  }
};

/** Pop an undo entry onto redo; apply it with `revertWidgetHistoryEntry`. */
export function undoWidgetHistory(
  stack: WidgetHistoryStack,
  current: WidgetData[]
): WidgetHistoryEntry | null {
  const entry = stack.undo.pop();
  if (!entry) return null;
  parkRemoved(entry, entry.after, entry.before, current);
  stack.redo.push(entry);
  // The new top is no longer the latest edit, so it must not absorb later ones.
  const top = stack.undo[stack.undo.length - 1];
  if (top) top.coalesceKey = null;
  return entry;
}

/** Pop a redo entry back onto undo; apply it with `replayWidgetHistoryEntry`. */
export function redoWidgetHistory(
  stack: WidgetHistoryStack,
  current: WidgetData[]
): WidgetHistoryEntry | null {
  const entry = stack.redo.pop();
  if (!entry) return null;
  parkRemoved(entry, entry.before, entry.after, current);
  entry.coalesceKey = null;
  stack.undo.push(entry);
  return entry;
}

export const revertWidgetHistoryEntry = (
  entry: WidgetHistoryEntry,
  current: WidgetData[]
): WidgetData[] =>
  applyWidgetDiff(entry.after, entry.before, current, entry.parked);

export const replayWidgetHistoryEntry = (
  entry: WidgetHistoryEntry,
  current: WidgetData[]
): WidgetData[] =>
  applyWidgetDiff(entry.before, entry.after, current, entry.parked);

const sameValue = (a: unknown, b: unknown): boolean =>
  a === b || stableStringify(a) === stableStringify(b);

type Fields = Record<string, unknown>;

const changedKeys = (from: Fields, to: Fields, skip?: string): string[] =>
  [...new Set([...Object.keys(from), ...Object.keys(to)])].filter(
    (k) => k !== skip && !sameValue(from[k], to[k])
  );

// Copies `keys` from `to` onto `target`, deleting keys `to` lacks; null when nothing changes.
const assignKeys = (
  target: Fields,
  to: Fields,
  keys: string[]
): Fields | null => {
  let next: Fields | null = null;
  for (const k of keys) {
    if (sameValue(target[k], to[k])) continue;
    next ??= { ...target };
    if (to[k] === undefined) delete next[k];
    else next[k] = to[k];
  }
  return next;
};

// Moves `current` from `from` to `to`, touching only the widgets, fields and config keys that differ.
export function applyWidgetDiff(
  from: WidgetData[],
  to: WidgetData[],
  current: WidgetData[],
  parked?: ReadonlyMap<string, WidgetData>
): WidgetData[] {
  const fromById = new Map(from.map((w) => [w.id, w]));
  const toById = new Map(to.map((w) => [w.id, w]));
  let changed = false;

  const kept: WidgetData[] = [];
  for (const live of current) {
    const f = fromById.get(live.id);
    const t = toById.get(live.id);
    if (f && !t) {
      changed = true;
      continue;
    }
    if (!f || !t || f === t) {
      kept.push(live);
      continue;
    }
    const fieldKeys = changedKeys(
      f as unknown as Fields,
      t as unknown as Fields,
      'version'
    );
    const topKeys = fieldKeys.filter((k) => k !== 'config');
    let next = assignKeys(
      live as unknown as Fields,
      t as unknown as Fields,
      topKeys
    );
    if (fieldKeys.includes('config')) {
      const fromConfig = (f.config ?? {}) as Fields;
      const toConfig = (t.config ?? {}) as Fields;
      const liveConfig = (live.config ?? {}) as Fields;
      const config = assignKeys(
        liveConfig,
        toConfig,
        changedKeys(fromConfig, toConfig)
      );
      if (config) next = { ...(next ?? live), config };
    }
    if (!next) {
      kept.push(live);
      continue;
    }
    changed = true;
    // Bump past the live version so the Firestore merge keeps the restored fields.
    kept.push({
      ...(next as unknown as WidgetData),
      version: Math.max(live.version ?? 1, t.version ?? 1) + 1,
    });
  }

  // Widgets the step brings back go after their nearest earlier neighbour in `to`.
  const liveIds = new Set(current.map((w) => w.id));
  let prevId: string | null = null;
  for (const t of to) {
    if (!fromById.has(t.id) && !liveIds.has(t.id)) {
      const at = prevId ? kept.findIndex((w) => w.id === prevId) + 1 : 0;
      kept.splice(at, 0, parked?.get(t.id) ?? t);
      changed = true;
    }
    if (kept.some((w) => w.id === t.id)) prevId = t.id;
  }

  return changed ? kept : current;
}
