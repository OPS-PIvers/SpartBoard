import { useCallback } from 'react';
import { useImageUpload } from '@/hooks/useImageUpload';
import { getImageDimensionsFromFile } from '@/utils/imageProcessing';
import { extractTextWithGemini } from '@/utils/ai';
import { decodeIfHeic } from '@/utils/quizDocumentImport/uploadIntake';
import { buildPhotoSticker, type ReferenceWidget } from './referenceLanding';

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });

/** Photo landings for Import: the whole photo as a sticker, or its text for a Flashcards Conversion (D13). */
export function usePhotoReference() {
  const { processAndUploadImage, uploading } = useImageUpload();

  const toSticker = useCallback(
    async (file: File): Promise<ReferenceWidget | null> => {
      const photo = await decodeIfHeic(file);
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
    return (await extractTextWithGemini(await readAsDataUrl(photo))).trim();
  }, []);

  return { toSticker, readText, uploading };
}
