import { useCallback } from 'react';
import type { WhiteboardStartingImage } from '@/types';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDialog } from '@/context/useDialog';
import { driveViewUrl, uploadDriveAsset } from '@/utils/driveAssetUpload';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Uploads a starting-page image the same way a quiz image stimulus is uploaded (D6). */
export function useWhiteboardImageUpload() {
  const { driveService } = useGoogleDrive();
  const { showAlert } = useDialog();

  return useCallback(
    async (
      file: File,
      driveName?: string,
      options?: { fixedTime?: string }
    ): Promise<WhiteboardStartingImage | null> => {
      if (!file.type.startsWith('image/')) {
        await showAlert(`"${file.name}" isn't an image.`, {
          variant: 'warning',
        });
        return null;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        await showAlert(
          `"${file.name}" is too large (max ${MAX_IMAGE_BYTES / 1024 / 1024}MB).`,
          { variant: 'warning' }
        );
        return null;
      }
      if (!driveService) {
        await showAlert('Connect Google Drive to upload files.', {
          variant: 'warning',
        });
        return null;
      }
      try {
        const bitmap = await createImageBitmap(file);
        const { width, height } = bitmap;
        bitmap.close();
        const driveFile = await uploadDriveAsset(driveService, {
          blob: file,
          name:
            driveName ??
            `stimulus-${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`,
          folder: 'Assets/QuizStimuli',
          fixedTime: options?.fixedTime,
          audience: 'anyone',
        });
        return {
          driveFileId: driveFile.id,
          url: driveViewUrl(driveFile.id),
          mimeType: file.type,
          width,
          height,
        };
      } catch (err) {
        await showAlert(
          err instanceof Error ? err.message : 'Upload failed. Try again.',
          { variant: 'error' }
        );
        return null;
      }
    },
    [driveService, showAlert]
  );
}
