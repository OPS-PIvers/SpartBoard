import { useSyncExternalStore } from 'react';

const QUERY = '(orientation: portrait)';

const subscribe = (onChange: () => void): (() => void) => {
  if (typeof window === 'undefined' || !window.matchMedia)
    return () => undefined;
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

const getSnapshot = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia
    ? window.matchMedia(QUERY).matches
    : false;

const getServerSnapshot = (): boolean => false;

/** True while the viewport is taller than it is wide. */
export const useIsPortrait = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
