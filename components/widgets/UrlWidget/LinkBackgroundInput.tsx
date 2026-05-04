import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Loader2,
  Trash2,
  Palette,
} from 'lucide-react';
import { useStorage } from '@/hooks/useStorage';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { URL_COLORS } from './icons';

const MAX_BYTES = 5 * 1024 * 1024;

interface LinkBackgroundInputProps {
  color?: string;
  imageUrl?: string;
  onChange: (next: { color?: string; imageUrl?: string }) => void;
}

export const LinkBackgroundInput: React.FC<LinkBackgroundInputProps> = ({
  color,
  imageUrl,
  onChange,
}) => {
  const [tab, setTab] = useState<'color' | 'image'>(
    imageUrl ? 'image' : 'color'
  );
  const [uploading, setUploading] = useState(false);
  const inFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { uploadSticker, deleteFile } = useStorage();

  const handleUpload = useCallback(
    async (file: File) => {
      if (inFlightRef.current) {
        addToast('An upload is already in progress.', 'info');
        return;
      }
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
      inFlightRef.current = true;
      setUploading(true);
      try {
        const url = await uploadSticker(user.uid, file);
        // Commit the new URL FIRST so a failed delete cannot orphan us with no image.
        onChange({ color, imageUrl: url });
        if (previousUrl) {
          try {
            await deleteFile(previousUrl);
          } catch (deleteErr) {
            console.warn(
              '[LinkBackgroundInput] Failed to delete previous image; the file may now be orphaned in Drive/Storage.',
              deleteErr
            );
          }
        }
        addToast('Image uploaded.', 'success');
      } catch (err) {
        console.error('[LinkBackgroundInput] Upload failed', err);
        addToast('Failed to upload image.', 'error');
      } finally {
        inFlightRef.current = false;
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [user, addToast, uploadSticker, deleteFile, onChange, imageUrl, color]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleUpload(file);
  };

  const handlePickColor = async (next: string) => {
    const previousImage = imageUrl;
    onChange({ color: next, imageUrl: undefined });
    if (previousImage) {
      try {
        await deleteFile(previousImage);
      } catch (deleteErr) {
        console.warn(
          '[LinkBackgroundInput] Failed to delete previous image when switching to color.',
          deleteErr
        );
      }
    }
  };

  const handleClearImage = async () => {
    const previousImage = imageUrl;
    onChange({ color, imageUrl: undefined });
    if (previousImage) {
      try {
        await deleteFile(previousImage);
      } catch (deleteErr) {
        console.warn(
          '[LinkBackgroundInput] Failed to delete cleared image.',
          deleteErr
        );
      }
    }
  };

  // Paste support — only while the inline image panel is mounted.
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
  }, [tab, handleUpload]);

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTab('color')}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xxs font-black uppercase tracking-widest transition-all border-2 ${
            tab === 'color'
              ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
              : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          <Palette size={12} />
          Color
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

      {tab === 'color' && (
        <div className="flex flex-wrap gap-2">
          {URL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void handlePickColor(c)}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                color === c && !imageUrl
                  ? 'border-slate-800 scale-110 shadow-sm'
                  : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Pick ${c}`}
              aria-pressed={color === c && !imageUrl}
            />
          ))}
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
              <img
                src={imageUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-md object-cover"
              />
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
                Click to browse, or Cmd/Ctrl-V to paste
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
