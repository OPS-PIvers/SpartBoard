import React, { useEffect, useRef, useState } from 'react';
import * as Icons from 'lucide-react';
import { Image as ImageIcon, Upload, Loader2, Trash2, X } from 'lucide-react';
import { COMMON_INSTRUCTIONAL_ICONS } from '@/config/instructionalIcons';
import { useStorage } from '@/hooks/useStorage';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { renderCatalystIcon } from '@/components/widgets/Catalyst/catalystHelpers';

const MAX_BYTES = 5 * 1024 * 1024;

interface IconOrImageInputProps {
  iconName?: string;
  imageUrl?: string;
  /**
   * Always called with the next (iconName, imageUrl) pair. Caller is responsible
   * for persisting via updateWidget. The component asks the caller to delete the
   * old Drive file via `onRequestDeletePreviousImage` only AFTER this resolves.
   */
  onChange: (next: { iconName?: string; imageUrl?: string }) => void;
}

const ICON_LIST: string[] = COMMON_INSTRUCTIONAL_ICONS;

export const IconOrImageInput: React.FC<IconOrImageInputProps> = ({
  iconName,
  imageUrl,
  onChange,
}) => {
  const [tab, setTab] = useState<'icon' | 'image'>(imageUrl ? 'image' : 'icon');
  const [iconSearch, setIconSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { uploadSticker, deleteFile } = useStorage();

  const filteredIcons = iconSearch
    ? ICON_LIST.filter((name) =>
        name.toLowerCase().includes(iconSearch.toLowerCase())
      )
    : ICON_LIST;

  const handleUpload = async (file: File) => {
    if (!user) {
      addToast('Sign in to upload images.', 'error');
      return;
    }
    if (!file.type.startsWith('image/')) {
      addToast('Please choose an image file.', 'error');
      return;
    }
    if (file.size > MAX_BYTES) {
      addToast('Image too large. 5 MB maximum.', 'error');
      return;
    }
    const previousUrl = imageUrl;
    setUploading(true);
    try {
      const url = await uploadSticker(user.uid, file);
      // Commit the new URL FIRST so a failed delete cannot orphan us with no image.
      onChange({ iconName: undefined, imageUrl: url });
      // Best-effort cleanup of the old image once the new one is in place.
      if (previousUrl) {
        try {
          await deleteFile(previousUrl);
        } catch (deleteErr) {
          // Non-fatal — log and move on; teacher can clean up manually if needed.
          console.warn(
            '[StationsIconOrImageInput] Failed to delete previous image; the file may now be orphaned in Drive/Storage.',
            deleteErr
          );
        }
      }
      addToast('Image uploaded.', 'success');
    } catch (err) {
      console.error('[StationsIconOrImageInput] Upload failed', err);
      addToast('Failed to upload image.', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleUpload(file);
  };

  const handlePickIcon = async (name: string) => {
    const previousImage = imageUrl;
    onChange({ iconName: name, imageUrl: undefined });
    if (previousImage) {
      try {
        await deleteFile(previousImage);
      } catch (deleteErr) {
        console.warn(
          '[StationsIconOrImageInput] Failed to delete previous image when switching to icon.',
          deleteErr
        );
      }
    }
  };

  const handleClearImage = async () => {
    const previousImage = imageUrl;
    onChange({ iconName: undefined, imageUrl: undefined });
    if (previousImage) {
      try {
        await deleteFile(previousImage);
      } catch (deleteErr) {
        console.warn(
          '[StationsIconOrImageInput] Failed to delete cleared image.',
          deleteErr
        );
      }
    }
  };

  // Paste support — listens only while the inline panel is mounted to avoid
  // global conflicts with text inputs elsewhere on the page.
  useEffect(() => {
    if (tab !== 'image') return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!containerRef.current?.contains(target)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void handleUpload(file);
            break;
          }
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // handleUpload is stable enough — dependency is intentionally minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, imageUrl]);

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTab('icon')}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xxs font-black uppercase tracking-widest transition-all border-2 ${
            tab === 'icon'
              ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
              : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          <Icons.Smile size={12} />
          Icon
        </button>
        <button
          type="button"
          onClick={() => setTab('image')}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xxs font-black uppercase tracking-widest transition-all border-2 ${
            tab === 'image'
              ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
              : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          <ImageIcon size={12} />
          Image
        </button>
      </div>

      {tab === 'icon' && (
        <div className="space-y-2">
          <input
            type="text"
            value={iconSearch}
            onChange={(e) => setIconSearch(e.target.value)}
            placeholder="Search icons..."
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
          />
          <div className="grid grid-cols-8 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1 border border-slate-200 rounded-lg bg-white">
            {filteredIcons.map((name) => {
              const IconComp = (
                Icons as unknown as Record<string, React.ElementType>
              )[name];
              if (!IconComp) return null;
              const isActive = iconName === name && !imageUrl;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => void handlePickIcon(name)}
                  title={name}
                  className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                    isActive
                      ? 'bg-brand-blue-primary text-white shadow-md scale-110'
                      : 'text-slate-500 hover:bg-blue-50 hover:text-brand-blue-primary'
                  }`}
                >
                  <IconComp size={14} />
                </button>
              );
            })}
            {filteredIcons.length === 0 && (
              <div className="col-span-8 text-center text-xs text-slate-400 py-3">
                No matching icons.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'image' && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {imageUrl ? (
            <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg bg-white">
              {renderCatalystIcon(imageUrl, 48, 'rounded-md')}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-700 truncate">
                  Custom image
                </div>
                <div className="text-xxs text-slate-400 truncate">
                  Saved to your Google Drive
                </div>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="p-1.5 rounded-md text-slate-400 hover:text-brand-blue-primary hover:bg-blue-50 transition-colors"
                title="Replace image"
              >
                {uploading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleClearImage()}
                disabled={uploading}
                className="p-1.5 rounded-md text-slate-400 hover:text-brand-red-primary hover:bg-red-50 transition-colors"
                title="Remove image"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full p-4 rounded-lg border-2 border-dashed border-slate-200 text-slate-500 hover:border-brand-blue-primary hover:bg-blue-50 transition-all flex flex-col items-center gap-2"
            >
              {uploading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Upload size={20} />
              )}
              <div className="text-xs font-bold text-slate-600">
                {uploading ? 'Uploading...' : 'Upload or paste image'}
              </div>
              <div className="text-xxs text-slate-400">
                Drag, click to browse, or Cmd/Ctrl-V to paste
              </div>
            </button>
          )}
          {iconName && imageUrl == null && !uploading && (
            <button
              type="button"
              onClick={() =>
                onChange({ iconName: undefined, imageUrl: undefined })
              }
              className="w-full text-xxs font-bold uppercase tracking-widest text-slate-400 hover:text-brand-red-primary py-1 flex items-center justify-center gap-1.5"
            >
              <X size={11} />
              Clear icon (no preview)
            </button>
          )}
        </div>
      )}
    </div>
  );
};
