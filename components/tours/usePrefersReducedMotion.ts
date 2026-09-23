import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const media = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null;

const subscribe = (onChange: () => void) => {
  const mq = media();
  mq?.addEventListener('change', onChange);
  return () => mq?.removeEventListener('change', onChange);
};

const getSnapshot = () => media()?.matches ?? false;

/** Live `prefers-reduced-motion: reduce`. */
export const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, () => false);
