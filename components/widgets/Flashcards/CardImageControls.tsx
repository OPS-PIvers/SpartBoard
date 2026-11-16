import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { ImageLightbox } from '@/components/common/ImageLightbox';
import type { CardImageState } from './useCardImage';

const ICON = { width: 'min(15px, 4cqmin)', height: 'min(15px, 4cqmin)' };
const THUMB = 'min(26px, 6.5cqmin)';

interface ButtonProps {
  image: CardImageState;
  url: string | undefined;
  label: string;
  side: 'term' | 'definition';
  fieldKey: string;
  onRemove: () => void;
}

/** Inside the field: picks a picture, or shows it small and opens a preview. */
export const CardImageButton: React.FC<ButtonProps> = ({
  image,
  url,
  label,
  side,
  fieldKey,
  onRemove,
}) => {
  const input = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const anchor = tourFieldAttr(
    side === 'term'
      ? 'flashcards.card-term-image'
      : 'flashcards.card-definition-image',
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
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={image.uploading}
        className={`rounded-lg hover:bg-slate-100 hover:text-slate-700 disabled:cursor-wait ${
          image.failed ? 'text-rose-600' : 'text-slate-400'
        }`}
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
