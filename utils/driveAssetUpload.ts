import type { DriveFile, GoogleDriveService } from './googleDriveService';

// Folders the app uploads images, drawings and PDFs to; only these files are ever trashed by URL.
export const DRIVE_UPLOAD_FOLDERS = [
  'Assets/Backgrounds',
  'Assets/DisplayImages',
  'Assets/HotspotImages',
  'Assets/PDFs',
  'Assets/PaperSheetStimuli',
  'Assets/QuizAudio',
  'Assets/QuizStimuli',
  'Assets/QuizSupports',
  'Assets/Screenshots',
  'Assets/Stickers',
  'Backgrounds',
  'Drawings',
];

/** Who can open the file: anyone with the link, the teacher's domain (anyone for consumer accounts), or only the teacher. */
export type DriveAssetAudience =
  | { audience: 'anyone' }
  | { audience: 'domain'; domain: string | undefined }
  | { audience: 'private' };

/** What uploading and sharing an asset needs of `GoogleDriveService`. */
export interface DriveAssetDrive<F extends { id: string } = DriveFile> {
  uploadFile: (
    file: Blob,
    fileName: string,
    folderPath?: string,
    appProperties?: Record<string, string>,
    options?: { fixedTime?: string }
  ) => Promise<F>;
  makePublic: (fileId: string, domain?: string) => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
}

export type UploadDriveAssetOptions = {
  blob: Blob;
  name: string;
  folder: string;
  appProperties?: Record<string, string>;
  fixedTime?: string;
} & DriveAssetAudience;

export type CopyDriveAssetOptions = {
  fileId: string;
  name: string;
  folder: string;
} & DriveAssetAudience;

/** The image URL students' browsers load (lh3 serves Drive images with CORS headers). */
export const driveImageUrl = (id: string): string =>
  `https://lh3.googleusercontent.com/d/${id}`;

/** Drive's own viewer for the file. */
export const driveViewUrl = (id: string): string =>
  `https://drive.google.com/file/d/${id}/view`;

/** Drive's embeddable preview, used for PDFs. */
export const drivePreviewUrl = (id: string): string =>
  `https://drive.google.com/file/d/${id}/preview`;

// A file nobody can open is worse than none, so a failed share removes it.
async function shareOrRemove(
  drive: DriveAssetDrive<{ id: string }>,
  fileId: string,
  audience: DriveAssetAudience
): Promise<void> {
  if (audience.audience === 'private') return;
  try {
    await drive.makePublic(
      fileId,
      audience.audience === 'domain' ? audience.domain : undefined
    );
  } catch (error) {
    await drive.deleteFile(fileId).catch(() => undefined);
    throw error;
  }
}

/** The one way to put a teacher's file in their Drive and share it with its audience. */
export async function uploadDriveAsset<F extends { id: string } = DriveFile>(
  drive: DriveAssetDrive<F>,
  opts: UploadDriveAssetOptions
): Promise<F> {
  const file = opts.fixedTime
    ? await drive.uploadFile(
        opts.blob,
        opts.name,
        opts.folder,
        opts.appProperties,
        {
          fixedTime: opts.fixedTime,
        }
      )
    : opts.appProperties
      ? await drive.uploadFile(
          opts.blob,
          opts.name,
          opts.folder,
          opts.appProperties
        )
      : await drive.uploadFile(opts.blob, opts.name, opts.folder);
  await shareOrRemove(drive, file.id, opts);
  return file;
}

/** Copies a picked Drive file into an app folder and shares the copy, so the original keeps its own sharing. */
export async function copyDriveAsset(
  drive: DriveAssetDrive & Pick<GoogleDriveService, 'copyFile'>,
  opts: CopyDriveAssetOptions
): Promise<DriveFile> {
  const copy = await drive.copyFile(opts.fileId, opts.name, opts.folder);
  await shareOrRemove(drive, copy.id, opts);
  return copy;
}
