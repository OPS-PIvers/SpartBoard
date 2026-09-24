import { useCallback, useSyncExternalStore } from 'react';

const media = (query: string): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null;

/** Live match of a CSS media query; false where matchMedia is missing. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = media(query);
      mq?.addEventListener?.('change', onChange);
      return () => mq?.removeEventListener?.('change', onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => media(query)?.matches ?? false,
    () => false
  );
}

/** Header controls fold into the overflow menu below this width. */
export const COMPACT_HEADER_QUERY = '(max-width: 1099px)';
/** Below this width the Studio suggests a larger screen. */
export const SMALL_SCREEN_QUERY = '(max-width: 899px)';
