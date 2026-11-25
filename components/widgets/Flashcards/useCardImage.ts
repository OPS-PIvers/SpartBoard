import type React from 'react';
import { useState } from 'react';
import { imageFileFrom } from '@/utils/flashcardImageUrls';

/** Uploads a picked, pasted or dropped image; resolves to its URL, or null when it can't be used. */
export type CardImageUploader = (file: File) => Promise<string | null>;

export interface CardImageState {
  uploading: boolean;
  failed: boolean;
  pick: (file: File | null | undefined) => void;
  clearFailed: () => void;
  /** Spread on the side's wrapper: paste or drop an image anywhere in it. */
  targetProps: Pick<
    React.HTMLAttributes<HTMLDivElement>,
    'onPaste' | 'onDragOver' | 'onDrop'
  >;
}

export const useCardImage = (
  upload: CardImageUploader | null,
  onUrl: (url: string) => void
): CardImageState => {
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);

  const pick = (file: File | null | undefined): void => {
    if (!upload || !file || uploading) return;
    setUploading(true);
    setFailed(false);
    void upload(file)
      .then((url) => {
        if (url) onUrl(url);
        else setFailed(true);
      })
      .catch(() => setFailed(true))
      .finally(() => setUploading(false));
  };

  const hasFile = (event: React.DragEvent): boolean =>
    Array.from(event.dataTransfer.types).includes('Files');
  // The shared picker's button and its portaled panel take their own paste and drop.
  const pickerOwns = (event: React.SyntheticEvent): boolean =>
    event.defaultPrevented ||
    !(event.target instanceof Node) ||
    !event.currentTarget.contains(event.target);

  return {
    uploading,
    failed,
    pick,
    clearFailed: () => setFailed(false),
    targetProps: upload
      ? {
          onPaste: (event) => {
            if (pickerOwns(event)) return;
            const file = imageFileFrom(event.clipboardData.items);
            if (!file) return;
            event.preventDefault();
            pick(file);
          },
          onDragOver: (event) => {
            if (pickerOwns(event)) return;
            if (hasFile(event)) event.preventDefault();
          },
          onDrop: (event) => {
            if (pickerOwns(event)) return;
            const file = imageFileFrom(event.dataTransfer.files);
            if (!file) return;
            event.preventDefault();
            pick(file);
          },
        }
      : {},
  };
};
