import { useCallback, useMemo } from 'react';
import { useAuth } from '../context/useAuth';
import { GoogleDriveService } from '../utils/googleDriveService';
import { APP_NAME } from '../config/constants';

const BACKGROUNDS_FOLDER = 'Backgrounds';

export const useGoogleDrive = () => {
  const { googleAccessToken, refreshGoogleToken, user } = useAuth();

  const driveService = useMemo(() => {
    if (!googleAccessToken) return null;
    return new GoogleDriveService(googleAccessToken, refreshGoogleToken);
  }, [googleAccessToken, refreshGoogleToken]);

  const userDomain = user?.email?.split('@')[1];
  const isConnected = !!googleAccessToken;

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

  return {
    driveService,
    isConnected,
    isInitialized: isConnected,
    refreshGoogleToken,
    userDomain,
    uploadBackgroundToDrive,
    getUserBackgroundsFromDrive,
  };
};
