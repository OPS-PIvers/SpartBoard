import { useSyncExternalStore } from 'react';

// Kept with the tab so the record/edit round trip and a reload land on the same item (H17).
export const HELP_CENTER_SELECTION_KEY =
  'spart.adminSettings.helpCenter.selected';

const listeners = new Set<() => void>();
let memory: string | null = null;

export function readHelpCenterSelection(): string | null {
  try {
    return window.localStorage.getItem(HELP_CENTER_SELECTION_KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function writeHelpCenterSelection(id: string | null): void {
  memory = id;
  try {
    if (id) window.localStorage.setItem(HELP_CENTER_SELECTION_KEY, id);
    else window.localStorage.removeItem(HELP_CENTER_SELECTION_KEY);
  } catch {
    // Storage can be blocked; the in-memory value still holds for this tab.
  }
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** The selected Help Center item id and its setter, shared by Admin Settings and the round trip. */
export function useHelpCenterSelection(): [
  string | null,
  (id: string | null) => void,
] {
  const id = useSyncExternalStore(
    subscribe,
    readHelpCenterSelection,
    () => null
  );
  return [id, writeHelpCenterSelection];
}
