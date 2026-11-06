import React, { useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { ImageLightbox } from '@/components/common/ImageLightbox';

/** Tile: picture fills the top of a word-bank chip. Row: picture at the left of a full-width answer row. */
export type AnswerImageLayout = 'tile' | 'row';

const SIZE: Record<AnswerImageLayout, string> = {
  tile: 'w-full h-32 sm:h-48',
  row: 'h-24 w-32 sm:h-32 sm:w-44',
};

/** Picture on an answer; the text names it, and chips must not start a native image drag. */
export const AnswerImage: React.FC<{
  src: string;
  layout?: AnswerImageLayout;
}> = ({ src, layout = 'row' }) => (
  <img
    src={src}
    alt=""
    draggable={false}
    className={`rounded-lg object-contain bg-white shrink-0 pointer-events-none ${SIZE[layout]}`}
  />
);

/** An answer's text, with its picture when it has one. */
export const AnswerLabel: React.FC<{
  label: React.ReactNode;
  image?: string;
  layout?: AnswerImageLayout;
}> = ({ label, image, layout = 'row' }) =>
  !image ? (
    <>{label}</>
  ) : layout === 'tile' ? (
    <span className="flex w-full flex-col gap-2">
      <AnswerImage src={image} layout="tile" />
      <span className="min-w-0 text-center wrap-break-word">{label}</span>
    </span>
  ) : (
    <span className="flex items-center gap-3">
      <AnswerImage src={image} layout="row" />
      <span className="min-w-0 wrap-break-word">{label}</span>
    </span>
  );

/** Word-bank chip width when its answer has a picture. */
export const ANSWER_TILE_WIDTH = 'w-36 sm:w-52';

/** Opens an answer's picture full screen; sits beside or over the answer, never inside its button. */
export const AnswerImageZoomButton: React.FC<{
  src: string;
  label: string;
  className?: string;
}> = ({ src, label, className = '' }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        // no-tour-anchor: student quiz screen; tours walk teachers
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Enlarge picture: ${label}`}
        title="Enlarge picture"
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-700 shadow-xs transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary ${className}`}
      >
        <ZoomIn className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <ImageLightbox
          src={src}
          alt={label}
          caption={label}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

/** A picture that is not part of a button (a Matching term): tapping it enlarges it. */
export const ZoomableAnswerImage: React.FC<{ src: string; label: string }> = ({
  src,
  label,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        // no-tour-anchor: student quiz screen; tours walk teachers
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Enlarge picture: ${label}`}
        title="Enlarge picture"
        className="relative shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary"
      >
        <AnswerImage src={src} layout="row" />
        <span className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-700 shadow-xs">
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
      {open && (
        <ImageLightbox
          src={src}
          alt={label}
          caption={label}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};
