import { useSyncExternalStore } from 'react';

interface WindowSize {
  width: number;
  height: number;
}

const emptySize: WindowSize = { width: 0, height: 0 };

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

function getSnapshot() {
  if (typeof window === 'undefined') {
    return emptySize;
  }
  // Returning a new object on every call breaks useSyncExternalStore caching,
  // so we need to memoize the object based on width/height.
  return windowSizeCache.getSnapshot();
}

const windowSizeCache = {
  currentSize: emptySize,
  getSnapshot() {
    if (typeof window === 'undefined') return emptySize;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.currentSize.width !== w || this.currentSize.height !== h) {
      this.currentSize = { width: w, height: h };
    }
    return this.currentSize;
  },
};

/**
 * Hook that returns the current window dimensions.
 * @param enabled - Whether to actively listen for resize events. Defaults to true.
 *                  Optimization: pass false when the component doesn't need to respond
 *                  to resizes (e.g. when not maximized).
 */
export const useWindowSize = (enabled: boolean = true): WindowSize => {
  // useSyncExternalStore requires a stable subscribe function.
  // We can pass a dummy subscribe function when disabled.
  const activeSubscribe = enabled ? subscribe : () => () => undefined;

  return useSyncExternalStore(activeSubscribe, getSnapshot, () => emptySize);
};
