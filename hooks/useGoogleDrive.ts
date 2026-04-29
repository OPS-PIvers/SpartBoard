import { useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '../context/useAuth';
import { GoogleDriveService } from '../utils/googleDriveService';
import { onDriveTokenChange } from '../utils/driveAuthErrors';
import { APP_NAME } from '../config/constants';

const BACKGROUNDS_FOLDER = 'Backgrounds';
const DRAWINGS_FOLDER = 'Drawings';
const LEGACY_FOLDER_NAME = 'SPART Board';
const MIGRATION_COMPLETED_FLAG = 'true';
const migrationKey = (uid: string) => `spart_drive_folder_migrated_v2_${uid}`;

// The Drive auth-error toast machinery (handler registration, latch, token
// rotation) lives in `utils/driveAuthErrors`. Both Drive services call
// `reportDriveAuthError` from their throw sites, so the toast surfaces
// platform-wide without each useGoogleDrive consumer wiring it up.
// `setDriveAuthErrorHandler` is consumed by DashboardContext from the
// new module — re-export it here for backwards-compat with any callers
// still pointing at this hook.
export { setDriveAuthErrorHandler } from '../utils/driveAuthErrors';

export const useGoogleDrive = () => {
  const { googleAccessToken, refreshGoogleToken, user } = useAuth();

  const driveService = useMemo(() => {
    if (!googleAccessToken) return null;
    return new GoogleDriveService(googleAccessToken, refreshGoogleToken);
  }, [googleAccessToken, refreshGoogleToken]);

  const userDomain = user?.email?.split('@')[1];
  const isConnected = !!googleAccessToken;

  // Re-arm the toast latch when (and only when) a new token arrives. This
  // is how Reconnect → refreshGoogleToken() → fresh token re-enables the
  // toast for the next stale episode without spamming during the current
  // one. The shared helper handles "same token, different consumer
  // mounting" as a no-op.
  useEffect(() => {
    onDriveTokenChange(googleAccessToken);
  }, [googleAccessToken]);

  // One-time migration: rename the legacy "SPART Board" Drive folder to the
  // current APP_NAME ("SpartBoard") so existing users don't lose their data.
  // The Drive service auto-reports auth errors via the shared toast surface,
  // so this catch block just logs and lets retry-on-next-load handle it.
  useEffect(() => {
    if (!driveService || !user?.uid) return;
    const key = migrationKey(user.uid);
    if (localStorage.getItem(key)) return;

    driveService
      .migrateAppFolderName(LEGACY_FOLDER_NAME, APP_NAME)
      .then(() => localStorage.setItem(key, MIGRATION_COMPLETED_FLAG))
      .catch((error) => {
        console.error('Failed to migrate Google Drive folder name:', error);
      });
  }, [driveService, user?.uid]);

  /**
   * Upload an image file to the user's Drive "Backgrounds" folder and return
   * a publicly-renderable URL for use as a dashboard background.
   *
   * Files are always shared as type: 'anyone' (anyone with the link) so that
   * the URL works as a CSS background-image across all contexts, including
   * student view and unauthenticated sessions.
   */
  const uploadBackgroundToDrive = useCallback(
    async (file: File): Promise<string> => {
      if (!driveService) {
        throw new Error('Google Drive is not connected. Please sign in again.');
      }

      const driveFile = await driveService.uploadFile(
        file,
        file.name,
        BACKGROUNDS_FOLDER
      );

      // Pass undefined for domain to force type: 'anyone' sharing so the URL
      // is loadable in all contexts (student view, preview, etc.).
      await driveService.makePublic(driveFile.id, undefined);

      // Use the lh3.googleusercontent.com domain which serves Drive files with
      // proper CORS headers, making the URL usable as a CSS background-image.
      return `https://lh3.googleusercontent.com/d/${driveFile.id}`;
    },
    [driveService]
  );

  /**
   * Fetch all background images previously uploaded to Drive by this user.
   * Returns an array of renderable URLs sorted newest-first.
   *
   * Uses a read-only folder lookup (findFolder) so browsing the "My Uploads"
   * tab never creates empty folders as a side effect.
   */
  const getUserBackgroundsFromDrive = useCallback(async (): Promise<
    string[]
  > => {
    if (!driveService) return [];

    // Read-only lookup — never creates the app or Backgrounds folder
    const appFolderId = await driveService.findFolder(APP_NAME);
    if (!appFolderId) return [];

    const bgFolderId = await driveService.findFolder(
      BACKGROUNDS_FOLDER,
      appFolderId
    );
    if (!bgFolderId) return [];

    const files = await driveService.listFiles(
      `mimeType contains 'image/' and '${bgFolderId}' in parents and trashed = false`,
      'createdTime desc'
    );

    return files.map((f) => `https://lh3.googleusercontent.com/d/${f.id}`);
  }, [driveService]);

  /**
   * Upload a drawing/annotation PNG to the user's Drive "Drawings" folder and
   * return a shareable Drive viewer URL.
   *
   * Sharing: when the user is on a Google Workspace domain, the file is
   * shared with that domain (so only colleagues at the same school can open
   * it). Consumer accounts (gmail.com etc.) fall back to "anyone with the
   * link" automatically — `makePublic` handles the consumer-domain case.
   * Annotations can contain classroom info, so domain-restricted sharing
   * is the safer default when available.
   *
   * NOTE: Returns a `drive.google.com/file/d/.../view` URL — intended for
   * teachers clicking through to open the saved annotation in Drive's
   * native viewer. This is **different** from `uploadBackgroundToDrive`,
   * which returns a `lh3.googleusercontent.com/d/...` URL so the image can
   * be rendered via CSS `background-image` (requires CORS-friendly headers).
   * Annotations are teacher-facing artifacts, not embedded images, so the
   * viewer URL is the appropriate return value.
   */
  const saveDrawingToDrive = useCallback(
    async (blob: Blob, fileName: string): Promise<string> => {
      if (!driveService) {
        throw new Error('Google Drive is not connected. Please sign in again.');
      }

      const driveFile = await driveService.uploadFile(
        blob,
        fileName,
        DRAWINGS_FOLDER
      );

      await driveService.makePublic(driveFile.id, userDomain);

      return `https://drive.google.com/file/d/${driveFile.id}/view`;
    },
    [driveService, userDomain]
  );

  /**
   * Attempts to extract text content from a Google Drive file if it is a supported type (Docs, Slides, Sheets, Text).
   */
  const getDriveFileTextContent = useCallback(
    async (fileId: string): Promise<string | null> => {
      if (!driveService) return null;
      try {
        const metadata = await driveService.getFileMetadata(fileId);
        const text = await driveService.exportFileText(
          fileId,
          metadata.mimeType
        );
        return text;
      } catch (error) {
        // Drive service auto-reports auth errors to the shared toast surface.
        console.error('Failed to extract text from Drive file:', error);
        return null;
      }
    },
    [driveService]
  );

  /**
   * Download a binary file (e.g. a JPEG/PNG image) from Drive as a Blob.
   * Used by image-picker flows that want to push the raw bytes to Firebase
   * Storage + forward a base64 copy to Gemini.
   */
  const getDriveFileAsBlob = useCallback(
    async (
      fileId: string
    ): Promise<{ blob: Blob; mimeType: string; name: string } | null> => {
      if (!driveService) return null;
      try {
        return await driveService.downloadFileAsBlob(fileId);
      } catch (error) {
        // Drive service auto-reports auth errors to the shared toast surface.
        console.error('Failed to download Drive file:', error);
        return null;
      }
    },
    [driveService]
  );

  return {
    driveService,
    isConnected,
    isInitialized: isConnected,
    refreshGoogleToken,
    userDomain,
    uploadBackgroundToDrive,
    getUserBackgroundsFromDrive,
    getDriveFileTextContent,
    getDriveFileAsBlob,
    saveDrawingToDrive,
  };
};
