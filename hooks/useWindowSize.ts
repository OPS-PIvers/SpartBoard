import { useSyncExternalStore, useCallback } from 'react';

interface WindowSize {
  width: number;
  height: number;
}

const INITIAL_SIZE: WindowSize = { width: 0, height: 0 };
let cachedSnapshot: WindowSize = INITIAL_SIZE;

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

const getSnapshot = (): WindowSize => {
  if (typeof window === 'undefined') {
    return INITIAL_SIZE;
  }

  const { innerWidth: width, innerHeight: height } = window;

  if (cachedSnapshot.width !== width || cachedSnapshot.height !== height) {
    cachedSnapshot = { width, height };
  }

  return cachedSnapshot;
};

const getServerSnapshot = () => INITIAL_SIZE;

/**
 * Hook that returns the current window dimensions.
 * @param enabled - Whether to actively listen for resize events. Defaults to true.
 *                  Optimization: pass false when the component doesn't need to respond
 *                  to resizes (e.g. when not maximized).
 */
export const useWindowSize = (enabled: boolean = true): WindowSize => {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!enabled || typeof window === 'undefined') {
        return noop;
      }
      window.addEventListener('resize', callback);
      return () => window.removeEventListener('resize', callback);
    },
    [enabled]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
