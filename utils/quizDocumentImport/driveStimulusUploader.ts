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

/** Drive folder every quiz stimulus lands in, matching the editor's panel. */
export const STIMULUS_FOLDER = 'Assets/QuizStimuli';

/** What uploading a stimulus needs of `GoogleDriveService`. */
export interface StimulusDrive {
  uploadFile: (
    file: File | Blob,
    fileName: string,
    folderPath?: string
  ) => Promise<{ id: string }>;
  makePublic: (fileId: string, domain?: string) => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
}

export function driveStimulusUploader(drive: StimulusDrive): StimulusUploader {
  return {
    upload: async (image: ExtractedImage) => {
      const safeName = image.name.replace(/[^\w.-]+/g, '_');
      const file = new File([image.blob], safeName, {
        type: image.contentType,
      });
      const driveFile = await drive.uploadFile(
        file,
        `stimulus-${Date.now()}-${safeName}`,
        STIMULUS_FOLDER
      );
      try {
        // undefined domain forces type:'anyone' — students open stimuli
        // without a Google identity a domain grant could match.
        await drive.makePublic(driveFile.id, undefined);
      } catch (error) {
        // The caller never learns this id, so it has to be cleaned up here
        // or the file is stranded in the teacher's Drive unshared.
        await drive.deleteFile(driveFile.id).catch(() => undefined);
        throw error;
      }
      return {
        driveFileId: driveFile.id,
        url: `https://drive.google.com/file/d/${driveFile.id}/view`,
      };
    },
    remove: async (driveFileId: string) => {
      await drive.deleteFile(driveFileId);
    },
  };
}
