import { useSyncExternalStore, useCallback, useRef } from 'react';

interface WindowSize {
  width: number;
  height: number;
}

const INITIAL_SIZE: WindowSize = { width: 0, height: 0 };

const noop = (): void => undefined;

// Singleton store to manage a single event listener and shared state
export const windowSizeStore = {
  snapshot:
    typeof window !== 'undefined'
      ? { width: window.innerWidth, height: window.innerHeight }
      : INITIAL_SIZE,
  listeners: new Set<() => void>(),
  subscribe(callback: () => void) {
    this.listeners.add(callback);
    if (this.listeners.size === 1) {
      window.addEventListener('resize', this.handleResize);
    }
    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) {
        window.removeEventListener('resize', this.handleResize);
      }
    };
  },
  handleResize: () => {
    const { innerWidth: width, innerHeight: height } = window;
    if (
      windowSizeStore.snapshot.width !== width ||
      windowSizeStore.snapshot.height !== height
    ) {
      windowSizeStore.snapshot = { width, height };
      windowSizeStore.listeners.forEach((cb) => cb());
    }
  },
  getSnapshot() {
    if (typeof window === 'undefined') return INITIAL_SIZE;
    // Ensure we have the latest values even if called during render without an event
    const { innerWidth: width, innerHeight: height } = window;
    if (this.snapshot.width !== width || this.snapshot.height !== height) {
      this.snapshot = { width, height };
    }
    return this.snapshot;
  },
  getServerSnapshot: () => INITIAL_SIZE,
};

// Bind methods so they can be passed as bare functions
windowSizeStore.subscribe = windowSizeStore.subscribe.bind(windowSizeStore);
windowSizeStore.getSnapshot = windowSizeStore.getSnapshot.bind(windowSizeStore);

/**
 * Hook that returns the current window dimensions.
 * @param enabled - Whether to actively listen for resize events. Defaults to true.
 *                  Optimization: pass false when the component doesn't need to respond
 *                  to resizes (e.g. when not maximized).
 */
export const useWindowSize = (enabled: boolean = true): WindowSize => {
  const disabledSnapshotRef = useRef<WindowSize | null>(null);

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!enabled || typeof window === 'undefined') return noop;
      return windowSizeStore.subscribe(callback);
    },
    [enabled]
  );

  const getSnapshot = useCallback((): WindowSize => {
    const latest = windowSizeStore.getSnapshot();
    if (enabled) {
      disabledSnapshotRef.current = latest;
      return latest;
    }
    // If disabled, freeze the snapshot to the last known value.
    disabledSnapshotRef.current ??= latest;
    return disabledSnapshotRef.current;
  }, [enabled]);

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    windowSizeStore.getServerSnapshot
  );
};
