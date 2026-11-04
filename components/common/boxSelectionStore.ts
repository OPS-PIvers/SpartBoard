import { useSyncExternalStore } from 'react';

// Widgets picked with Ctrl+drag or Ctrl+click on the board; they move and resize together.
const EMPTY: readonly string[] = [];
let selected: readonly string[] = EMPTY;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const getBoxSelection = (): readonly string[] => selected;

export const setBoxSelection = (ids: readonly string[]): void => {
  const next = ids.length === 0 ? EMPTY : [...new Set(ids)];
  if (
    next.length === selected.length &&
    next.every((id, i) => id === selected[i])
  ) {
    return;
  }
  selected = next;
  for (const fn of listeners) fn();
};

export const clearBoxSelection = (): void => setBoxSelection(EMPTY);

export const toggleBoxSelected = (id: string): void =>
  setBoxSelection(
    selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
  );

export const useBoxSelection = (): readonly string[] =>
  useSyncExternalStore(subscribe, getBoxSelection, getBoxSelection);

export const useIsBoxSelected = (id: string): boolean =>
  useSyncExternalStore(
    subscribe,
    () => selected.includes(id),
    () => false
  );
