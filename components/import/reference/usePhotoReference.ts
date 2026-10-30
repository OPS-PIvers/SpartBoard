import { useCallback } from 'react';
import { useImageUpload } from '@/hooks/useImageUpload';
import { getImageDimensionsFromFile } from '@/utils/imageProcessing';
import { extractTextWithGemini } from '@/utils/ai';
import { decodeIfHeic } from '@/utils/quizDocumentImport/uploadIntake';
import { buildPhotoSticker, type ReferenceWidget } from './referenceLanding';

const OCR_MAX_EDGE = 2000;

// Phone photos are far bigger than OCR needs and can pass the callable's payload cap.
async function downscaledDataUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    OCR_MAX_EDGE / Math.max(bitmap.width, bitmap.height)
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Photo landings for Import: the whole photo as a sticker, or its text for a Flashcards Conversion (D13). */
export function usePhotoReference() {
  const { processAndUploadImage, uploading } = useImageUpload();

  const toSticker = useCallback(
    async (file: File): Promise<ReferenceWidget | null> => {
      let photo: File;
      try {
        photo = await decodeIfHeic(file);
      } catch {
        return null;
      }
      const [url, dims] = await Promise.all([
        processAndUploadImage(photo, { skipProcessing: true }),
        getImageDimensionsFromFile(photo).catch(() => null),
      ]);
      return url ? buildPhotoSticker(url, dims) : null;
    },
    [processAndUploadImage]
  );

  // Quiz reads photos itself; this OCR is the bridge for targets that take text.
  const readText = useCallback(async (file: File): Promise<string> => {
    const photo = await decodeIfHeic(file);
    return (await extractTextWithGemini(await downscaledDataUrl(photo))).trim();
  }, []);

  return { toSticker, readText, uploading };
}
