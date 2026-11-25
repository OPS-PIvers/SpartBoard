/**
 * The Drive half of importing a test document's pictures (D13).
 *
 * Separate from `attachDocumentImages` so the two-step store — upload, then
 * share — can be tested without a Drive. Getting a file into Drive and
 * failing to share it leaves a picture no student could open, so that case
 * cleans up after itself rather than counting as an upload.
 */

import type { StimulusUploader } from './attachImages';
import type { ExtractedImage } from './types';
import {
  driveViewUrl,
  uploadDriveAsset,
  type DriveAssetDrive,
} from '../driveAssetUpload';

/** Drive folder every quiz stimulus lands in, matching the editor's panel. */
export const STIMULUS_FOLDER = 'Assets/QuizStimuli';

/** What uploading a stimulus needs of `GoogleDriveService`. */
export type StimulusDrive = DriveAssetDrive<{ id: string }>;

// A missing Drive fails each upload, so a widget can build the uploader before sign-in finishes.
export function driveStimulusUploader(
  drive: StimulusDrive | null
): StimulusUploader {
  return {
    upload: async (image: ExtractedImage) => {
      if (!drive) throw new Error('Google Drive is not connected.');
      const safeName = image.name.replace(/[^\w.-]+/g, '_');
      const file = new File([image.blob], safeName, {
        type: image.contentType,
      });
      // Anyone with the link: students open stimuli without a Google identity.
      const driveFile = await uploadDriveAsset(drive, {
        blob: file,
        name: `stimulus-${Date.now()}-${safeName}`,
        folder: STIMULUS_FOLDER,
        audience: 'anyone',
      });
      return {
        driveFileId: driveFile.id,
        url: driveViewUrl(driveFile.id),
      };
    },
    remove: async (driveFileId: string) => {
      await drive?.deleteFile(driveFileId);
    },
  };
}
