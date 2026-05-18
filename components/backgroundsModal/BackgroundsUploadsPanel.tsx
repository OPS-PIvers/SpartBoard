import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Loader2 } from 'lucide-react';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDriveReconnected } from '@/hooks/useDriveReconnected';
import { useDashboard } from '@/context/useDashboard';

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
      } catch {
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
      setBackground(downloadURL);
      setUserUploads((prev) => [downloadURL, ...prev]);
      addToast('Custom background saved to your Drive', 'success');
    } catch (err) {
      console.error('Background upload failed:', err);
      addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
      ) : userUploads.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">
          {t('backgrounds.noUploadsYet', {
            defaultValue: 'You have not uploaded any backgrounds yet.',
          })}
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {userUploads.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => setBackground(url)}
              className={`block w-full aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                activeBackground === url
                  ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                  : 'border-transparent hover:border-slate-300'
              }`}
            >
              <img
                src={url}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
