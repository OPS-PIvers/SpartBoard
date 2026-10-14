import { useCallback } from 'react';
import type { WhiteboardStartingImage } from '@/types';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDialog } from '@/context/useDialog';
import {
  stimulusShareMessage,
  STIMULUS_SHARE_CONFIRM,
} from '@/utils/quizStimuli';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Uploads a starting-page image the same way a quiz image stimulus is uploaded (D6). */
export function useWhiteboardImageUpload() {
  const { driveService } = useGoogleDrive();
  const { showConfirm, showAlert } = useDialog();

  return useCallback(
    async (file: File): Promise<WhiteboardStartingImage | null> => {
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
        const driveFile = await driveService.uploadFile(
          file,
          `stimulus-${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`,
          'Assets/QuizStimuli'
        );
        if (
          !(await showConfirm(
            stimulusShareMessage(file.name),
            STIMULUS_SHARE_CONFIRM
          ))
        ) {
          await driveService.deleteFile(driveFile.id).catch(() => undefined);
          return null;
        }
        await driveService.makePublic(driveFile.id, undefined);
        return {
          driveFileId: driveFile.id,
          url: `https://drive.google.com/file/d/${driveFile.id}/view`,
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
    [driveService, showAlert, showConfirm]
  );
}
