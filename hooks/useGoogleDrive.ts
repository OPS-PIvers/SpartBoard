import { useMemo } from 'react';
import { useAuth } from '../context/useAuth';
import { GoogleDriveService } from '../utils/googleDriveService';

export const useGoogleDrive = () => {
  const { googleAccessToken, refreshGoogleToken, user } = useAuth();

  const driveService = useMemo(() => {
    if (!googleAccessToken) return null;
    return new GoogleDriveService(googleAccessToken);
  }, [googleAccessToken]);

  const userDomain = user?.email?.split('@')[1];

  return {
    driveService,
    isConnected: !!googleAccessToken,
    refreshGoogleToken,
    userDomain,
  };
};
