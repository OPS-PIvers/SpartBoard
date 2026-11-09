/** Edits to the same field this close together undo as one. */
export const COALESCE_MS = 1000;
export const HISTORY_LIMIT = 50;

/** An editor's undo stack: earlier drafts, undone drafts, and the last coalescing key. */
export interface TourHistory<T> {
  past: T[];
  future: T[];
  last: { key: string; at: number } | null;
}

export const newTourHistory = <T>(): TourHistory<T> => ({
  past: [],
  future: [],
  last: null,
});

/** Records `prev` as undoable before an edit; a keystroke run on one field stays one entry. */
export function pushTourEdit<T>(
  h: TourHistory<T>,
  prev: T,
  coalesce: string | undefined,
  now: number
): TourHistory<T> {
  const merge =
    !!coalesce && h.last?.key === coalesce && now - h.last.at < COALESCE_MS;
  return {
    past: merge ? h.past : [...h.past, prev].slice(-HISTORY_LIMIT),
    future: [],
    last: coalesce ? { key: coalesce, at: now } : null,
  };
}

/** Steps back (past) or forward (future) from `current`; null when there is nothing to restore. */
export function stepTourHistory<T>(
  h: TourHistory<T>,
  from: 'past' | 'future',
  current: T
): { history: TourHistory<T>; value: T } | null {
  const stack = h[from];
  const value = stack[stack.length - 1];
  if (value === undefined) return null;
  const other = from === 'past' ? 'future' : 'past';
  return {
    value,
    history: {
      ...h,
      [from]: stack.slice(0, -1),
      [other]: [...h[other], current],
      last: null,
    },
  };
}
