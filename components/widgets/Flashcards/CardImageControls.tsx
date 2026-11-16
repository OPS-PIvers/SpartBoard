import React, { useRef } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { CardImageState } from './useCardImage';

const ICON = { width: 'min(15px, 4cqmin)', height: 'min(15px, 4cqmin)' };

interface ButtonProps {
  image: CardImageState;
  label: string;
  side: 'term' | 'definition';
  fieldKey: string;
}

/** Opens the file picker for a side's picture; sits inside the field. */
export const CardImageButton: React.FC<ButtonProps> = ({
  image,
  label,
  side,
  fieldKey,
}) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={image.uploading}
        className="rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-wait"
        style={{ padding: 'min(5px, 1.2cqmin)' }}
        aria-label={`Add image to ${label}`}
        title="Add image"
        {...tourFieldAttr(
          side === 'term'
            ? 'flashcards.card-term-image'
            : 'flashcards.card-definition-image',
          'flashcards',
          fieldKey
        )}
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

interface PreviewProps {
  url: string | undefined;
  failed: boolean;
  label: string;
  onRemove: () => void;
}

/** The side's picture under its text, or the upload error. */
export const CardImagePreview: React.FC<PreviewProps> = ({
  url,
  failed,
  label,
  onRemove,
}) => {
  if (failed && !url) {
    return (
      <p
        className="font-semibold text-rose-700"
        style={{
          fontSize: 'min(12px, 3.5cqmin)',
          marginLeft: 'min(14px, 3.5cqmin)',
        }}
        role="alert"
      >
        {"Image didn't upload"}
      </p>
    );
  }
  if (!url) return null;
  return (
    <div className="relative self-start">
      <img
        src={url}
        alt={`${label} image`}
        className="block rounded-lg border border-slate-200 bg-white object-contain"
        style={{ height: 'min(84px, 21cqmin)', maxWidth: '100%' }}
      />
      {/* no-tour-anchor: per-image remove, a tour points at the add button */}
      <button
        type="button"
        onClick={onRemove}
        className="touch-target-expand absolute top-0 right-0 flex items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-xs hover:border-slate-400 hover:text-slate-800"
        style={{
          width: 'min(20px, 5cqmin)',
          height: 'min(20px, 5cqmin)',
          transform: 'translate(40%, -40%)',
        }}
        aria-label={`Remove image from ${label}`}
        title="Remove image"
      >
        <X
          style={{ width: 'min(12px, 3cqmin)', height: 'min(12px, 3cqmin)' }}
        />
      </button>
    </div>
  );
};
