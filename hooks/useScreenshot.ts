import { useState, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { useStorage } from './useStorage';
import { useAuth } from '@/context/useAuth';

interface UseScreenshotResult {
  takeScreenshot: (options?: { upload?: boolean }) => Promise<string | void>;
  isFlashing: boolean;
  isCapturing: boolean;
}

interface ScreenshotOptions {
  onSuccess?: (url?: string) => void;
  onError?: (error: unknown) => void;
}

export const useScreenshot = (
  nodeOrRef: React.RefObject<HTMLElement | null> | HTMLElement | null,
  fileName: string,
  options: ScreenshotOptions = {}
): UseScreenshotResult => {
  const [isFlashing, setIsFlashing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const { onSuccess, onError } = options;
  const { user } = useAuth();
  const { uploadScreenshot } = useStorage();

  const takeScreenshot = useCallback(
    async (takeOptions: { upload?: boolean } = {}) => {
      const node =
        nodeOrRef && 'current' in nodeOrRef ? nodeOrRef.current : nodeOrRef;

      if (!node) return;

      try {
        setIsCapturing(true);

        // Trigger Flash Animation
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 300);

        await new Promise((resolve) => setTimeout(resolve, 10));

        const dataUrl = await toPng(node, {
          cacheBust: true,
          pixelRatio: 2,
          filter: (node: Element) => {
            if (!(node instanceof HTMLElement)) {
              return true;
            }
            const dataset = node.dataset;
            const shouldExclude =
              dataset.screenshot === 'flash' ||
              dataset.screenshot === 'exclude' ||
              node.classList.contains('isFlashing');

            return !shouldExclude;
          },
        });

        if (takeOptions.upload && user) {
          // Convert dataUrl to blob
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          const url = await uploadScreenshot(user.uid, blob);
          onSuccess?.(url);
          return url;
        } else {
          // Download logic
          const link = document.createElement('a');
          link.download = `${fileName}.png`;
          link.href = dataUrl;
          link.click();
          onSuccess?.();
          return;
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('Screenshot failed:', error);
        onError?.(error);
        return;
      } finally {
        setIsCapturing(false);
      }
    },
    [nodeOrRef, fileName, onSuccess, onError, user, uploadScreenshot]
  );

  return { takeScreenshot, isFlashing, isCapturing };
};
