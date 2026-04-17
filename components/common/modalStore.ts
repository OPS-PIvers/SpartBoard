/**
 * Shared state for portalled `Modal` instances.
 *
 * Counts how many modals are currently mounted and exposes a `useHasOpenModal`
 * hook so other UI (DraggableWindow's floating toolbar, popovers that would
 * render above the modal surface, etc.) can suppress itself while any modal
 * is on screen.
 */

import { useSyncExternalStore } from 'react';

let openModalCount = 0;
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

/** Modal calls this on mount. */
export const incrementOpenModalCount = (): number => {
  openModalCount += 1;
  notify();
  return openModalCount;
};

/**
 * Modal calls this on unmount. Clamps at 0 so a stray extra call can't drive
 * the counter negative and leave `document.body.style.overflow` locked.
 */
export const decrementOpenModalCount = (): number => {
  if (openModalCount === 0) {
    if (import.meta.env.DEV) {
      console.warn(
        '[modalStore] decrementOpenModalCount called while count is 0'
      );
    }
    return 0;
  }
  openModalCount -= 1;
  notify();
  return openModalCount;
};

/** Current count, synchronous. */
export const getOpenModalCount = (): number => openModalCount;

const subscribeToOpenModalCount = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Returns true whenever at least one portalled `Modal` is mounted.
 */
export const useHasOpenModal = (): boolean =>
  useSyncExternalStore(subscribeToOpenModalCount, getOpenModalCount, () => 0) >
  0;
