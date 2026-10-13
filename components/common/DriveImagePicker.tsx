import React, { useCallback, useState } from 'react';
import { Loader2, ImageIcon, AlertCircle } from 'lucide-react';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useStorage } from '@/hooks/useStorage';
import { useAuth } from '@/context/useAuth';
import { blobToBase64 } from '@/utils/fileEncoding';

export interface PickedDriveImage {
  url: string;
  base64: string;
  mimeType: string;
  fileName: string;
}

interface DriveImagePickerProps {
  onImageAdded: (image: PickedDriveImage) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  variant?: 'light' | 'dark';
}

/**
 * Lets users pick a single image from Google Drive. The picked file is
 * uploaded to Firebase Storage (via `uploadHotspotImage`) and converted to
 * base64 in parallel so the consumer can both render it and send the bytes
 * to Gemini. Callers that need multiple images should invoke this once per
 * image.
 */
export const DriveImagePicker: React.FC<DriveImagePickerProps> = ({
  onImageAdded,
  disabled = false,
  className = '',
  label = 'Add image from Drive',
  variant = 'light',
}) => {
  const { user } = useAuth();
  const { openPicker, isConnected } = useGooglePicker();
  const { getDriveFileAsBlob } = useGoogleDrive();
  const { uploadHotspotImage } = useStorage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (disabled || loading || !user) return;
      setError(null);

      // Flip `loading` before opening the picker so the button is disabled for
      // the entire async flow (picker open → download → upload). Otherwise a
      // double-click while the picker modal is up could launch a second picker
      // and race two uploads.
      setLoading(true);

      try {
        const picked = await openPicker({ mode: 'images' });
        if (!picked) return;

        const downloaded = await getDriveFileAsBlob(picked.id);
        if (!downloaded) {
          setError('Could not download the selected image from Drive.');
          return;
        }

        const file = new File([downloaded.blob], downloaded.name, {
          type: downloaded.mimeType,
        });

        const [url, base64] = await Promise.all([
          uploadHotspotImage(user.uid, file),
          blobToBase64(downloaded.blob),
        ]);

        onImageAdded({
          url,
          base64,
          mimeType: downloaded.mimeType,
          fileName: downloaded.name,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to add Drive image';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [
      disabled,
      loading,
      user,
      openPicker,
      getDriveFileAsBlob,
      uploadHotspotImage,
      onImageAdded,
    ]
  );

  if (!isConnected) return null;

  const isDark = variant === 'dark';

  const buttonClasses = isDark
    ? 'flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-200 hover:text-white bg-white/5 hover:bg-white/10 border border-dashed border-white/10 hover:border-white/20 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
    : 'self-start flex items-center gap-1.5 py-1 text-xs font-bold text-slate-600 hover:text-brand-blue-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={handlePick}
        disabled={disabled || loading || !user}
        className={buttonClasses}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ImageIcon className="w-3.5 h-3.5" />
        )}
        {loading ? 'Adding image…' : label}
      </button>
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 animate-in slide-in-from-top-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
