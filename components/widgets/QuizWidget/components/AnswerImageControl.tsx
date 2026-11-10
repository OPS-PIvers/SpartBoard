import React from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

/** Add button, or the thumbnail with a remove button once an answer has a picture. */
export const AnswerImageControl: React.FC<{
  image?: string;
  uploading: boolean;
  disabled: boolean;
  onPick: () => void;
  onRemove: () => void;
  /** Screen reader name of the answer, such as "item 2". */
  name: string;
  addAttrs: TourAnchorAttrs;
  removeAttrs: TourAnchorAttrs;
}> = ({
  image,
  uploading,
  disabled,
  onPick,
  onRemove,
  name,
  addAttrs,
  removeAttrs,
}) =>
  image ? (
    <div className="relative shrink-0">
      <img
        src={image}
        alt=""
        className="w-9 h-9 rounded-lg object-cover border border-slate-200 bg-white"
      />
      <button
        // no-tour-anchor: anchor comes from the caller in removeAttrs
        type="button"
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-slate-700 text-white hover:bg-brand-red-primary transition-colors touch-target-expand"
        aria-label={`Remove image from ${name}`}
        title="Remove image"
        {...removeAttrs}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  ) : (
    <button
      // no-tour-anchor: anchor comes from the caller in addAttrs
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="relative flex items-center justify-center w-9 h-9 shrink-0 rounded-lg text-slate-500 hover:text-brand-blue-primary hover:bg-slate-100 transition-colors disabled:opacity-40 touch-target-expand"
      aria-label={`Add image to ${name}`}
      title="Add image, or paste one into the text box"
      {...addAttrs}
    >
      {uploading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <ImagePlus className="w-4 h-4" />
      )}
    </button>
  );

/** Optional screen reader description under an answer that is only a picture. */
export const PictureDescriptionInput: React.FC<{
  value: string;
  onChange: (alt: string) => void;
  /** Screen reader name of the answer, such as "option B". */
  name: string;
  attrs: TourAnchorAttrs;
  /** Wrapper classes, such as an indent that lines the box up with the text box above. */
  className?: string;
}> = ({ value, onChange, name, attrs, className = '' }) => (
  <div className={`min-w-0 ${className}`}>
    <input
      // no-tour-anchor: anchor comes from the caller in attrs
      type="text"
      value={value}
      maxLength={150}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Describe the picture (optional)"
      title="Read to students who use a screen reader"
      aria-label={`Describe the picture in ${name}`}
      className="w-full min-w-0 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:border-brand-blue-primary"
      {...attrs}
    />
  </div>
);
