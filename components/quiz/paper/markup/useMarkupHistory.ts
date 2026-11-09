import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PaperMarkupItem } from '@/types';

type Items = readonly PaperMarkupItem[];

/** Snapshots before each change; 40 small items per answer make whole-list snapshots cheap. */
export interface MarkupHistoryState {
  past: Items[];
  future: Items[];
}

export const MAX_MARKUP_UNDO = 100;

export const EMPTY_HISTORY: MarkupHistoryState = { past: [], future: [] };

export function historyCommit(
  h: MarkupHistoryState,
  current: Items
): MarkupHistoryState {
  return { past: [...h.past, current].slice(-MAX_MARKUP_UNDO), future: [] };
}

export function historyUndo(
  h: MarkupHistoryState,
  current: Items
): { history: MarkupHistoryState; items: Items } | null {
  if (h.past.length === 0) return null;
  return {
    items: h.past[h.past.length - 1],
    history: { past: h.past.slice(0, -1), future: [...h.future, current] },
  };
}

export function historyRedo(
  h: MarkupHistoryState,
  current: Items
): { history: MarkupHistoryState; items: Items } | null {
  if (h.future.length === 0) return null;
  return {
    items: h.future[h.future.length - 1],
    history: { past: [...h.past, current], future: h.future.slice(0, -1) },
  };
}

export interface MarkupHistory {
  commit: (next: PaperMarkupItem[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** Undo and redo over the answer's item list; lives as long as the editor (one answer). */
export function useMarkupHistory(
  items: Items,
  onChange: (next: PaperMarkupItem[]) => void
): MarkupHistory {
  const [history, setHistory] = useState<MarkupHistoryState>(EMPTY_HISTORY);
  const itemsRef = useRef(items);
  const historyRef = useRef(history);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    itemsRef.current = items;
    historyRef.current = history;
    onChangeRef.current = onChange;
  });

  // Refs advance synchronously so key auto-repeat never applies one step twice.
  const apply = useCallback((h: MarkupHistoryState, next: Items) => {
    historyRef.current = h;
    itemsRef.current = next;
    setHistory(h);
    onChangeRef.current([...next]);
  }, []);

  const commit = useCallback(
    (next: PaperMarkupItem[]) =>
      apply(historyCommit(historyRef.current, itemsRef.current), next),
    [apply]
  );
  const undo = useCallback(() => {
    const r = historyUndo(historyRef.current, itemsRef.current);
    if (r) apply(r.history, r.items);
  }, [apply]);
  const redo = useCallback(() => {
    const r = historyRedo(historyRef.current, itemsRef.current);
    if (r) apply(r.history, r.items);
  }, [apply]);

  return useMemo(
    () => ({
      commit,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    }),
    [commit, undo, redo, history.past.length, history.future.length]
  );
}
