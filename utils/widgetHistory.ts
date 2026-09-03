import type { WidgetData } from '@/types';

export const WIDGET_HISTORY_LIMIT = 50;
// Rapid updates to the same widget (drag stream, typing) fold into one entry.
export const WIDGET_HISTORY_COALESCE_MS = 1000;

export interface WidgetHistoryEntry {
  widgets: WidgetData[];
  coalesceKey: string | null;
  touchedAt: number;
}

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
  if (top && top.widgets === before) {
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
  stack.undo.push({ widgets: before, coalesceKey, touchedAt: now });
  if (stack.undo.length > WIDGET_HISTORY_LIMIT) {
    stack.undo.splice(0, stack.undo.length - WIDGET_HISTORY_LIMIT);
  }
  stack.redo = [];
  return true;
}

/** Pop an undo entry, pushing `current` onto redo. Returns the widgets to restore. */
export function undoWidgetHistory(
  stack: WidgetHistoryStack,
  current: WidgetData[]
): WidgetData[] | null {
  const entry = stack.undo.pop();
  if (!entry) return null;
  stack.redo.push({ widgets: current, coalesceKey: null, touchedAt: 0 });
  return entry.widgets;
}

/** Pop a redo entry, pushing `current` onto undo. Returns the widgets to restore. */
export function redoWidgetHistory(
  stack: WidgetHistoryStack,
  current: WidgetData[]
): WidgetData[] | null {
  const entry = stack.redo.pop();
  if (!entry) return null;
  stack.undo.push({ widgets: current, coalesceKey: null, touchedAt: 0 });
  return entry.widgets;
}
