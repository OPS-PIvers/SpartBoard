import { useState } from 'react';
import { isPreviewMode } from '@/utils/previewMode';

/**
 * Read `?preview=1` on mount and immediately strip it from the URL bar so a
 * teacher copying the URL from the address bar gets the clean student URL.
 * Strip runs synchronously inside the state initializer — before the first
 * paint — so the address bar never momentarily shows `preview=1` after the
 * component mounts. A page refresh exits preview mode (the flag is gone);
 * the preview tab is meant to be looked at and closed, not refreshed.
 */
export const usePreviewMode = (): boolean => {
  const [previewMode] = useState(() => {
    const active = isPreviewMode();
    if (active && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.delete('preview');
      const search = params.toString();
      const cleanedUrl =
        window.location.pathname +
        (search ? `?${search}` : '') +
        window.location.hash;
      window.history.replaceState(null, '', cleanedUrl);
    }
    return active;
  });
  return previewMode;
};
