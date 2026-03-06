import { useMemo } from 'react';
import { useAuth } from '../context/useAuth';
import { GoogleDriveService } from '../utils/googleDriveService';

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
   */
  const uploadBackgroundToDrive = async (file: File): Promise<string> => {
    if (!driveService) {
      throw new Error('Google Drive is not connected. Please sign in again.');
    }

    const driveFile = await driveService.uploadFile(
      file,
      file.name,
      BACKGROUNDS_FOLDER
    );

    // Make the file readable by anyone so it can be used as an image source
    await driveService.makePublic(driveFile.id, userDomain);

    // Use the lh3.googleusercontent.com domain which serves Drive files with
    // proper CORS headers, making the URL usable as a CSS background-image.
    return `https://lh3.googleusercontent.com/d/${driveFile.id}`;
  };

  /**
   * Fetch all background images previously uploaded to Drive by this user.
   * Returns an array of renderable URLs (newest-first).
   */
  const getUserBackgroundsFromDrive = async (): Promise<string[]> => {
    if (!driveService) return [];

    let folderId: string;
    try {
      folderId = await driveService.getFolderPath(BACKGROUNDS_FOLDER);
    } catch {
      // If folder lookup fails, treat as no backgrounds uploaded yet
      return [];
    }

    const files = await driveService.listFiles(
      `mimeType contains 'image/' and '${folderId}' in parents and trashed = false`,
      'createdTime desc'
    );

    return files.map((f) => `https://lh3.googleusercontent.com/d/${f.id}`);
  };

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
