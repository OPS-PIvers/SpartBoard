import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Loader2 } from 'lucide-react';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDriveReconnected } from '@/hooks/useDriveReconnected';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import { BackgroundThumbnail } from './BackgroundThumbnail';
import type { BackgroundItem } from './backgroundsHelpers';

interface BackgroundsUploadsPanelProps {
  activeBackground?: string;
}

export const BackgroundsUploadsPanel: React.FC<
  BackgroundsUploadsPanelProps
> = ({ activeBackground }) => {
  const { t } = useTranslation();
  const {
    uploadBackgroundToDrive,
    getUserBackgroundsFromDrive,
    isInitialized,
  } = useGoogleDrive();
  const { setBackground, addToast } = useDashboard();
  const {
    favoriteBackgrounds,
    toggleFavoriteBackground,
    recordRecentBackground,
  } = useAuth();

  /**
   * Apply an upload and record it as a recent. Fire-and-forget on the
   * record — a failed Firestore write should not block the visual change
   * the user already saw on screen.
   */
  const applyUpload = (url: string) => {
    setBackground(url);
    recordRecentBackground(url).catch((err) => {
      logError('BackgroundsUploadsPanel.applyUpload.recordRecent', err);
    });
  };

  const [userUploads, setUserUploads] = useState<string[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hasFetchedDrive, setHasFetchedDrive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isInitialized || hasFetchedDrive) return;
    let cancelled = false;
    const fetch = async () => {
      setLoadingUploads(true);
      try {
        const urls = await getUserBackgroundsFromDrive();
        if (!cancelled) setUserUploads(urls);
      } catch (err) {
        logError('BackgroundsUploadsPanel.fetch', err);
        if (!cancelled)
          addToast('Failed to load past backgrounds from Drive', 'error');
      } finally {
        if (!cancelled) {
          setHasFetchedDrive(true);
          setLoadingUploads(false);
        }
      }
    };
    void fetch();
    return () => {
      cancelled = true;
    };
  }, [isInitialized, hasFetchedDrive, getUserBackgroundsFromDrive, addToast]);

  useDriveReconnected(() => setHasFetchedDrive(false));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      addToast('Image too large (Max 5MB)', 'error');
      return;
    }
    if (!isInitialized) {
      addToast('Google Drive is not connected. Please sign in again.', 'error');
      return;
    }
    setUploading(true);
    try {
      const downloadURL = await uploadBackgroundToDrive(file);
      applyUpload(downloadURL);
      setUserUploads((prev) => [downloadURL, ...prev]);
      addToast('Custom background saved to your Drive', 'success');
    } catch (err) {
      logError('BackgroundsUploadsPanel.handleFileUpload', err);
      addToast(
        t('backgrounds.uploadFailed', {
          defaultValue: 'Upload failed. Check your connection and try again.',
        }),
        'error'
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleFavorite = (id: string) => {
    toggleFavoriteBackground(id).catch((err) => {
      logError('BackgroundsUploadsPanel.toggleFavorite', err);
      addToast(
        t('backgrounds.favoriteSaveFailed', {
          defaultValue: 'Could not update favorites. Try again.',
        }),
        'error'
      );
    });
  };

  // Build BackgroundItem shapes from the raw URL list so the shared
  // BackgroundThumbnail component can render them with the favorite affordance.
  const uploadItems: BackgroundItem[] = userUploads.map((url) => ({
    id: url,
    label: t('backgrounds.uploadedImage', { defaultValue: 'Uploaded image' }),
    type: 'upload' as const,
    thumbnailUrl: url,
    tags: [],
  }));

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          type="button"
          aria-label={t('backgrounds.uploadCta', {
            defaultValue: 'Upload an image (max 5MB)',
          })}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !isInitialized}
          className="w-full flex items-center justify-center gap-2 p-3 bg-brand-blue-primary text-white rounded-lg font-bold text-sm hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('backgrounds.uploading', { defaultValue: 'Uploading…' })}
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              {t('backgrounds.uploadCta', {
                defaultValue: 'Upload an image (max 5MB)',
              })}
            </>
          )}
        </button>
        {!isInitialized && (
          <p className="text-xxs text-slate-400 mt-2 text-center">
            {t('backgrounds.driveNotConnected', {
              defaultValue: 'Google Drive must be connected to upload.',
            })}
          </p>
        )}
      </div>

      {loadingUploads ? (
        <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          {t('backgrounds.loadingUploads', {
            defaultValue: 'Loading your uploads…',
          })}
        </div>
      ) : uploadItems.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">
          {t('backgrounds.noUploadsYet', {
            defaultValue: 'You have not uploaded any backgrounds yet.',
          })}
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {uploadItems.map((item) => (
            <BackgroundThumbnail
              key={item.id}
              item={item}
              isActive={item.id === activeBackground}
              isFavorite={favoriteBackgrounds.includes(item.id)}
              onSelect={applyUpload}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
};
