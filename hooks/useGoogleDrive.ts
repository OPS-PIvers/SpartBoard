import { useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '../context/useAuth';
import { GoogleDriveService } from '../utils/googleDriveService';
import { APP_NAME } from '../config/constants';

const BACKGROUNDS_FOLDER = 'Backgrounds';
const LEGACY_FOLDER_NAME = 'SPART Board';
const MIGRATION_COMPLETED_FLAG = 'true';
const migrationKey = (uid: string) => `spart_drive_folder_migrated_v2_${uid}`;

export const useGoogleDrive = () => {
  const { googleAccessToken, refreshGoogleToken, user } = useAuth();

  const driveService = useMemo(() => {
    if (!googleAccessToken) return null;
    return new GoogleDriveService(googleAccessToken, refreshGoogleToken);
  }, [googleAccessToken, refreshGoogleToken]);

  const userDomain = user?.email?.split('@')[1];
  const isConnected = !!googleAccessToken;

  // One-time migration: rename the legacy "SPART Board" Drive folder to the
  // current APP_NAME ("SpartBoard") so existing users don't lose their data.
  useEffect(() => {
    if (!driveService || !user?.uid) return;
    const key = migrationKey(user.uid);
    if (localStorage.getItem(key)) return;

    driveService
      .migrateAppFolderName(LEGACY_FOLDER_NAME, APP_NAME)
      .then(() => localStorage.setItem(key, MIGRATION_COMPLETED_FLAG))
      .catch((error) => {
        // Silent fail — will retry on next page load
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
        console.error('Failed to extract text from Drive file:', error);
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
  };
};
