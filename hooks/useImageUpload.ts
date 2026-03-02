import { useState, useCallback } from 'react';
import { useStorage } from './useStorage';
import { useAuth } from '../context/useAuth';
import {
  trimImageWhitespace,
  removeBackground,
} from '../utils/imageProcessing';

export function useImageUpload(options?: {
  uploadFn?: (file: File) => Promise<string | null>;
}) {
  const { user } = useAuth();
  const { uploadSticker, uploading: storageUploading } = useStorage();
  const [processing, setProcessing] = useState(false);
  const uploadFn = options?.uploadFn;

  const uploading = storageUploading || processing;

  const processAndUploadImage = useCallback(
    async (file: File): Promise<string | null> => {
      if (!file.type.startsWith('image/') || (!user && !uploadFn)) return null;

      setProcessing(true);
      try {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Remove background and trim whitespace
        const noBg = await removeBackground(dataUrl);
        const trimmed = await trimImageWhitespace(noBg);

        // Convert back to Blob for upload
        const response = await fetch(trimmed);
        const blob = await response.blob();
        const processedFile = new File(
          [blob],
          file.name.replace(/\.[^/.]+$/, '') + '.png',
          { type: 'image/png' }
        );

        const url = uploadFn
          ? await uploadFn(processedFile)
          : user
            ? ((await uploadSticker(user.uid, processedFile)) as string | null)
            : null;

        return url;
      } catch (err) {
        console.error('Failed to process/upload sticker:', err);
        return null;
      } finally {
        setProcessing(false);
      }
    },
    [user, uploadSticker, uploadFn]
  );

  return { processAndUploadImage, uploading };
}
