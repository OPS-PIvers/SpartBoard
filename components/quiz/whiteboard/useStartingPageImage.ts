import { useCallback, useEffect, useState } from 'react';
import type { WhiteboardStartingPage } from '@/types';
import { driveImageUrl } from '@/utils/quizStimuli';

type Loaded = { key: string; image: HTMLImageElement | null; failed: boolean };

export interface StartingPageImageState {
  /** Decoded teacher image; null while loading, after a failure, or when there is none. */
  image: HTMLImageElement | null;
  /** True once the page has nothing left to load (no image, or it decoded). */
  ready: boolean;
  failed: boolean;
  retry: () => void;
}

/** Loads the starting page's teacher image and reports a failed load so the student can retry. */
export const useStartingPageImage = (
  spec: WhiteboardStartingPage | null | undefined
): StartingPageImageState => {
  const fileId = spec?.image?.driveFileId;
  const url = fileId ? driveImageUrl(fileId) : null;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${url ?? ''}|${attempt}`;

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    const image = new Image();
    // Without CORS the canvas is tainted and the picture export at commit fails.
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!cancelled) setLoaded({ key, image, failed: false });
    };
    image.onerror = () => {
      if (!cancelled) setLoaded({ key, image: null, failed: true });
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [key, url]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = loaded && loaded.key === key ? loaded : null;
  if (!url) return { image: null, ready: true, failed: false, retry };
  return {
    image: current?.image ?? null,
    ready: !!current?.image,
    failed: current?.failed ?? false,
    retry,
  };
};
