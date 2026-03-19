import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, Loader2, Grid, Image as ImageIcon, Video } from 'lucide-react';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDashboard } from '@/context/useDashboard';
import { extractYouTubeId } from '@/utils/url';

interface SidebarBackgroundsProps {
  isVisible: boolean;
}

export const SidebarBackgrounds: React.FC<SidebarBackgroundsProps> = ({
  isVisible,
}) => {
  const { presets, colors, gradients } = useBackgrounds();
  const {
    uploadBackgroundToDrive,
    getUserBackgroundsFromDrive,
    isInitialized,
  } = useGoogleDrive();
  const { activeDashboard, setBackground, addToast } = useDashboard();

  const [designTab, setDesignTab] = useState<'media' | 'colors' | 'my-uploads'>(
    'media'
  );

  // My Uploads state
  const [userUploads, setUserUploads] = useState<string[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hasFetchedDrive, setHasFetchedDrive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-sort admin presets into images vs ambient videos
  const { imagePresets, videoPresets } = useMemo(() => {
    return presets.reduce<{
      imagePresets: typeof presets;
      videoPresets: typeof presets;
    }>(
      (acc, bg) => {
        if (extractYouTubeId(bg.id)) {
          acc.videoPresets.push(bg);
        } else {
          acc.imagePresets.push(bg);
        }
        return acc;
      },
      { imagePresets: [], videoPresets: [] }
    );
  }, [presets]);

  // Fetch past uploads from Google Drive when the "My Uploads" tab is opened
  useEffect(() => {
    if (designTab !== 'my-uploads' || !isInitialized || hasFetchedDrive) return;

    const fetchUploads = async () => {
      setLoadingUploads(true);
      try {
        const urls = await getUserBackgroundsFromDrive();
        setUserUploads(urls);
      } catch {
        addToast('Failed to load past backgrounds from Drive', 'error');
      } finally {
        setHasFetchedDrive(true);
        setLoadingUploads(false);
      }
    };

    void fetchUploads();
  }, [
    designTab,
    isInitialized,
    hasFetchedDrive,
    getUserBackgroundsFromDrive,
    addToast,
  ]);

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
    } catch (error) {
      console.error('Background upload failed:', error);
      addToast(
        error instanceof Error ? error.message : 'Upload failed',
        'error'
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className={`absolute inset-0 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${
        isVisible
          ? 'translate-x-0 opacity-100 visible'
          : 'translate-x-full opacity-0 invisible'
      }`}
    >
      {/* Tab bar */}
      <div className="flex bg-slate-100 p-0.5 rounded-lg text-xxs font-bold uppercase tracking-widest shrink-0">
        <button
          onClick={() => setDesignTab('media')}
          className={`flex-1 py-1.5 rounded-md transition-all ${
            designTab === 'media'
              ? 'bg-white shadow-sm text-brand-blue-primary'
              : 'text-slate-500'
          }`}
        >
          Media
        </button>
        <button
          onClick={() => setDesignTab('colors')}
          className={`flex-1 py-1.5 rounded-md transition-all ${
            designTab === 'colors'
              ? 'bg-white shadow-sm text-brand-blue-primary'
              : 'text-slate-500'
          }`}
        >
          Colors
        </button>
        <button
          onClick={() => setDesignTab('my-uploads')}
          className={`flex-1 py-1.5 rounded-md transition-all ${
            designTab === 'my-uploads'
              ? 'bg-white shadow-sm text-brand-blue-primary'
              : 'text-slate-500'
          }`}
        >
          My Uploads
        </button>
      </div>

      {/* ── Media tab ── */}
      {designTab === 'media' && (
        <div className="flex flex-col gap-6 pb-4">
          {imagePresets.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                <ImageIcon className="w-3 h-3" /> Images
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {imagePresets.map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => setBackground(bg.id)}
                    className={`group relative aspect-video rounded-lg overflow-hidden border transition-all ${
                      activeDashboard?.background === bg.id
                        ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                        : 'border-slate-200'
                    }`}
                  >
                    <img
                      src={bg.thumbnailUrl ?? bg.id}
                      alt={bg.label}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xxxs font-bold uppercase px-1 text-center">
                        {bg.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {videoPresets.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                <Video className="w-3 h-3" /> Ambient Videos
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {videoPresets.map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => setBackground(bg.id)}
                    className={`group relative aspect-video rounded-lg overflow-hidden border transition-all ${
                      activeDashboard?.background === bg.id
                        ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                        : 'border-slate-200'
                    }`}
                  >
                    <img
                      src={bg.thumbnailUrl ?? bg.id}
                      alt={bg.label}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xxxs font-bold uppercase px-1 text-center">
                        {bg.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {imagePresets.length === 0 && videoPresets.length === 0 && (
            <p className="text-center text-xs text-slate-400 py-8">
              No media backgrounds available yet.
            </p>
          )}
        </div>
      )}

      {/* ── Colors tab ── */}
      {designTab === 'colors' && (
        <div className="flex flex-col gap-6 pb-4">
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase">
              Solid Colors
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {colors.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => setBackground(bg.id)}
                  className={`aspect-square rounded-lg border transition-all relative ${bg.id} ${
                    activeDashboard?.background === bg.id
                      ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                      : 'border-slate-200'
                  }`}
                >
                  {bg.label === 'Dot Grid' && (
                    <Grid className="w-4 h-4 absolute inset-0 m-auto text-slate-300" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase">
              Gradients
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {gradients.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => setBackground(bg.id)}
                  className={`aspect-video rounded-lg border transition-all relative ${
                    activeDashboard?.background === bg.id
                      ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                      : 'border-slate-200'
                  }`}
                >
                  <div className={`w-full h-full rounded-md ${bg.id}`} />
                  <div className="absolute bottom-1.5 left-1.5 text-xxxs font-bold uppercase text-white drop-shadow-md">
                    {bg.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── My Uploads tab ── */}
      {designTab === 'my-uploads' && (
        <div className="flex flex-col gap-4 pb-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !isInitialized}
            className="w-full py-8 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-brand-blue-primary hover:text-brand-blue-primary hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Upload className="w-6 h-6 mb-2" />
                <span className="text-xs font-bold uppercase tracking-wide">
                  Upload Image
                </span>
                {!isInitialized && (
                  <span className="text-xxs mt-1 text-slate-400">
                    Sign in with Google to enable
                  </span>
                )}
              </>
            )}
          </button>

          {loadingUploads ? (
            <div className="flex justify-center p-4">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : userUploads.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {userUploads.map((url) => (
                <button
                  key={url}
                  onClick={() => setBackground(url)}
                  className={`aspect-video rounded-lg overflow-hidden border transition-all ${
                    activeDashboard?.background === url
                      ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                      : 'border-slate-200'
                  }`}
                >
                  <img
                    src={url}
                    alt="Custom background"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 mt-2">
              Custom images you upload will be stored in your Google Drive and
              shared via link so they can be used as backgrounds.
            </p>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={(e) => void handleFileUpload(e)}
      />
    </div>
  );
};
