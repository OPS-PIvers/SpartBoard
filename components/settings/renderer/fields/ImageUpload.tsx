import React, { useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import type { FieldProps } from '../FieldProps';
import type { ImageUploadField as ImageUploadFieldSchema } from '@/components/settings/schema/types';
import { DriveImagePicker } from '@/components/common/DriveImagePicker';
import { useStorage } from '@/hooks/useStorage';
import { useAuth } from '@/context/useAuth';
import { resolveLabel } from '../resolveLabel';

const MAX_BYTES = 5 * 1024 * 1024;

// Image URL field: local upload (5 MB cap) or Drive pick, thumbnail preview, Clear.
export const ImageUpload: React.FC<
  FieldProps<ImageUploadFieldSchema<string>>
> = ({ field, value, onChange, id, describedBy, labelId, disabled, ctx }) => {
  const { user } = useAuth();
  const { deleteFile, uploadDisplayImage } = useStorage();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const url = typeof value === 'string' ? value : '';
  const t = (leaf: string) => resolveLabel(ctx.t, ctx.widget.type, leaf);
  const busy = disabled || uploading;

  const replaceUrl = (nextUrl: string) => {
    const previousUrl = url;
    onChange(nextUrl);
    if (previousUrl && previousUrl !== nextUrl) {
      void deleteFile(previousUrl).catch((err) => {
        console.warn('[ImageUpload] Failed to delete replaced image.', err);
      });
    }
  };

  const handleFile = async (file: File) => {
    if (inFlightRef.current) return;
    if (!user) {
      setError(t('signInToUpload'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError(t('imageInvalidType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('imageTooLarge'));
      return;
    }
    inFlightRef.current = true;
    setError(null);
    setUploading(true);
    try {
      replaceUrl(await uploadDisplayImage(user.uid, file));
    } catch (err) {
      console.error('[ImageUpload] Upload failed', err);
      setError(t('imageUploadFailed'));
    } finally {
      inFlightRef.current = false;
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const buttonClass =
    'flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-brand-blue-primary hover:text-brand-blue-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex flex-col gap-1.5"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={field.accept ?? 'image/*'}
        className="hidden"
        tabIndex={-1}
        aria-label={t('uploadImage')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      {url && (
        <div className="flex items-center gap-3 p-2 border border-slate-200 rounded-lg bg-white">
          <img
            src={url}
            alt={t('imagePreview')}
            className="w-12 h-12 object-contain rounded-md bg-slate-100"
            referrerPolicy="no-referrer"
          />
          <span className="flex-1 min-w-0 truncate text-xxs text-slate-600">
            {url}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => replaceUrl('')}
            aria-label={t('clearImage')}
            className="p-1.5 rounded-md text-slate-600 hover:text-brand-red-primary hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className={buttonClass}
        >
          {uploading ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Upload size={14} aria-hidden="true" />
          )}
          {uploading
            ? t('uploading')
            : url
              ? t('replaceImage')
              : t('uploadImage')}
        </button>
        <DriveImagePicker
          disabled={busy}
          label={t('imageFromDrive')}
          onImageAdded={(image) => {
            setError(null);
            replaceUrl(image.url);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-xxs text-brand-red-primary">
          {error}
        </p>
      )}
    </div>
  );
};
