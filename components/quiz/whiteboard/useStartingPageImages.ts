import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WhiteboardStartingPage } from '@/types';
import {
  placedImages,
  startingImageSrc,
  type StartingPageImages,
} from '@/utils/whiteboard/startingPage';

type Loaded = { key: string; images: StartingPageImages; failed: boolean };

const EMPTY: StartingPageImages = new Map();

export interface StartingPageImagesState {
  /** Decoded teacher images by `driveFileId`; partial or empty while loading or after a failure. */
  images: StartingPageImages;
  /** True once the page has nothing left to load (no images, or all decoded). */
  ready: boolean;
  failed: boolean;
  retry: () => void;
}

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const image = new Image();
    // Without CORS the canvas is tainted and the picture export at commit fails.
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

/** Loads every starting page image and reports a failed load so the student can retry. */
export const useStartingPageImages = (
  spec: WhiteboardStartingPage | null | undefined
): StartingPageImagesState => {
  // A string key, so an edit that only moves an image never reloads it.
  const sourceKey = useMemo(() => {
    const byId = new Map<string, string>();
    for (const img of placedImages(spec)) {
      if (!byId.has(img.driveFileId)) {
        byId.set(img.driveFileId, startingImageSrc(img));
      }
    }
    return JSON.stringify([...byId.entries()]);
  }, [spec]);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${attempt}#${sourceKey}`;
  const empty = sourceKey === '[]';

  useEffect(() => {
    const sources = JSON.parse(sourceKey) as [string, string][];
    if (sources.length === 0) return undefined;
    let cancelled = false;
    void Promise.all(sources.map(([, src]) => loadImage(src))).then(
      (elements) => {
        if (cancelled) return;
        const images = new Map<string, HTMLImageElement>();
        elements.forEach((el, i) => {
          if (el) images.set(sources[i][0], el);
        });
        setLoaded({
          key,
          images,
          failed: images.size < sources.length,
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key, sourceKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = loaded && loaded.key === key ? loaded : null;
  if (empty) {
    return { images: EMPTY, ready: true, failed: false, retry };
  }
  return {
    // Keeps the last decoded set while a new one loads, so removing an image does not blank the rest.
    images: current?.images ?? loaded?.images ?? EMPTY,
    ready: !!current && !current.failed,
    failed: current?.failed ?? false,
    retry,
  };
};
