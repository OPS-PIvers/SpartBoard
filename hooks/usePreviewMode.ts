import { useEffect, useState } from 'react';
import { isPreviewMode } from '@/utils/previewMode';

/**
 * Read `?preview=1` on mount and immediately strip it from the URL bar so a
 * teacher copying the URL from the address bar gets the clean student URL,
 * not the preview URL. The component stays in preview mode for its lifetime
 * because the value is captured in state at first render. A page refresh
 * exits preview mode — acceptable because the preview tab's purpose is "look
 * at it, then close it," not "refresh it."
 */
export const usePreviewMode = (): boolean => {
  const [previewMode] = useState(() => isPreviewMode());

  useEffect(() => {
    if (!previewMode || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.delete('preview');
    const search = params.toString();
    const cleanedUrl =
      window.location.pathname +
      (search ? `?${search}` : '') +
      window.location.hash;
    window.history.replaceState(null, '', cleanedUrl);
  }, [previewMode]);

  return previewMode;
};
