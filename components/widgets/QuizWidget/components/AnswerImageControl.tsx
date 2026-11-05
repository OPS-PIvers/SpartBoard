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
      className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg text-slate-500 hover:text-brand-blue-primary hover:bg-slate-100 transition-colors disabled:opacity-40 touch-target-expand"
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
