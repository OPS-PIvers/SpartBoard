import { useEffect, useState } from 'react';
import type { WhiteboardStartingPage } from '@/types';
import { driveImageUrl } from '@/utils/quizStimuli';

type Loaded = { url: string; image: HTMLImageElement };

/** Loads the starting page's teacher image; null until it decodes, or when there is none. */
export const useStartingPageImage = (
  spec: WhiteboardStartingPage | null | undefined
): HTMLImageElement | null => {
  const fileId = spec?.image?.driveFileId;
  const url = fileId ? driveImageUrl(fileId) : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    const image = new Image();
    // Without CORS the canvas is tainted and the picture export at commit fails.
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!cancelled) setLoaded({ url, image });
    };
    image.onerror = () => {
      if (!cancelled) console.error('Starting page image failed to load', url);
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return loaded && loaded.url === url ? loaded.image : null;
};
