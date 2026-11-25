import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { ImageLightbox } from '@/components/common/ImageLightbox';
import { ImagePicker } from '@/components/common/imagePicker/ImagePicker';
import { useAuth } from '@/context/useAuth';
import type { CardImageState, CardImageUploader } from './useCardImage';

const ICON = { width: 'min(15px, 4cqmin)', height: 'min(15px, 4cqmin)' };
const THUMB = 'min(26px, 6.5cqmin)';

interface ButtonProps {
  image: CardImageState;
  url: string | undefined;
  label: string;
  side: 'term' | 'definition';
  fieldKey: string;
  upload: CardImageUploader | null;
  onPick: (url: string) => void;
  onRemove: () => void;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
// Photos are shrunk before they save, so the picker takes any size like the old button did.
const NO_SIZE_CAP = Number.MAX_SAFE_INTEGER;

/** Inside the field: picks a picture, or shows it small and opens a preview. */
export const CardImageButton: React.FC<ButtonProps> = ({
  image,
  url,
  label,
  side,
  fieldKey,
  upload,
  onPick,
  onRemove,
}) => {
  const input = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const { canAccessFeature } = useAuth();
  const unifiedPicker = canAccessFeature('unified-image-picker');
  const anchor =
    side === 'term'
      ? tourFieldAttr('flashcards.card-term-image', 'flashcards', fieldKey)
      : tourFieldAttr(
          'flashcards.card-definition-image',
          'flashcards',
          fieldKey
        );
  if (url && !image.uploading) {
    return (
      <>
        <button
          type="button"
          onClick={() => setPreviewing(true)}
          className="overflow-hidden rounded-md border border-slate-200 bg-white hover:border-slate-400"
          style={{
            width: THUMB,
            height: THUMB,
            margin: '0 min(2px, 0.5cqmin)',
          }}
          aria-label={`Preview image on ${label}`}
          title="Preview image"
          {...anchor}
        >
          <img src={url} alt="" className="h-full w-full object-cover" />
        </button>
        {previewing && (
          <ImageLightbox
            src={url}
            alt={`${label} image`}
            onClose={() => setPreviewing(false)}
            actions={
              // no-tour-anchor: inside the full-screen preview, which tours don't open
              <button
                type="button"
                onClick={() => {
                  setPreviewing(false);
                  onRemove();
                }}
                className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white outline-hidden"
              >
                <Trash2 size={16} aria-hidden />
                Remove image
              </button>
            }
          />
        )}
      </>
    );
  }
  const buttonClassName = `rounded-lg hover:bg-slate-100 hover:text-slate-700 disabled:cursor-wait ${
    image.failed ? 'text-rose-600' : 'text-slate-400'
  }`;
  if (unifiedPicker && upload && !image.uploading) {
    return (
      <ImagePicker
        layout="button"
        label={`Add image to ${label}`}
        accept={ACCEPT}
        maxBytes={NO_SIZE_CAP}
        tourScope={{ type: 'flashcards', field: fieldKey }}
        tourOverrides={{ open: anchor }}
        buttonClassName={buttonClassName}
        buttonStyle={{ padding: 'min(5px, 1.2cqmin)' }}
        iconStyle={ICON}
        upload={async (file) => {
          const url = await upload(file);
          if (!url) throw new Error("Image didn't upload");
          return url;
        }}
        onChange={(url) => {
          image.clearFailed();
          onPick(url);
        }}
      />
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={image.uploading}
        className={buttonClassName}
        style={{ padding: 'min(5px, 1.2cqmin)' }}
        aria-label={`Add image to ${label}`}
        title={image.failed ? "Image didn't upload" : 'Add image'}
        {...anchor}
      >
        {image.uploading ? (
          <Loader2 style={ICON} className="animate-spin" aria-hidden />
        ) : (
          <ImagePlus style={ICON} aria-hidden />
        )}
      </button>
      {/* no-tour-anchor: hidden file input; tours point at the Add image button */}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          image.pick(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </>
  );
};
