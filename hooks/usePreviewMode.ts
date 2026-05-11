import { useLayoutEffect, useState } from 'react';
import { isPreviewMode } from '@/utils/previewMode';

/**
 * Read `?preview=1` on mount and strip it from the URL bar so a teacher
 * copying the URL from the address bar gets the clean student URL.
 *
 * The flag is captured in a pure `useState` initializer (StrictMode
 * double-invokes initializers in dev to verify purity; an impure
 * initializer that mutates `window.location` would return different
 * values on the two calls). The URL strip lives in `useLayoutEffect`
 * instead — same UX guarantee (fires synchronously after commit, before
 * the browser paints, so the address bar never momentarily shows
 * `preview=1`), but the mutation is properly contained in an effect.
 *
 * A page refresh exits preview mode; the preview tab is meant to be
 * looked at and closed, not refreshed.
 */
export const usePreviewMode = (): boolean => {
  const [previewMode] = useState(() => isPreviewMode());

  useLayoutEffect(() => {
    if (!previewMode || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.delete('preview');
    const search = params.toString();
    const cleanedUrl =
      window.location.pathname +
      (search ? `?${search}` : '') +
      window.location.hash;
    window.history.replaceState(null, '', cleanedUrl);
    // `previewMode` is captured at mount and never changes; stripping
    // already-stripped URL is a no-op idempotent operation, so a
    // StrictMode re-fire is safe.
  }, [previewMode]);

  return previewMode;
};
