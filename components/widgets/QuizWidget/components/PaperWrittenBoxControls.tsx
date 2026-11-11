// Written box controls (page count, paper type, image) shared by Assign on paper and the assign stepper.
import React from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { PaperBoxSize, PaperBoxStyle, PaperSheetStimulus } from '@/types';
import {
  PAPER_BOX_LINES,
  PAPER_CUSTOM_MAX_LINES,
  PAPER_CUSTOM_MIN_LINES,
  paperBoxLines,
} from '@/utils/paperWritten';

const BOX_SIZE_OPTIONS = [
  { value: 'S', label: `Short answer (${PAPER_BOX_LINES.S} lines)` },
  { value: 'M', label: `1 paragraph (${PAPER_BOX_LINES.M} lines)` },
  { value: 'full', label: '1 page' },
  { value: 'custom', label: 'Custom' },
] as const;

/** A box size as the menu shows it: a named size, or Custom for a line count (and the older Large). */
const boxSizeOption = (size: PaperBoxSize): string =>
  size === 'S' || size === 'M' || size === 'full' ? size : 'custom';

const BOX_STYLE_OPTIONS: readonly { value: PaperBoxStyle; label: string }[] = [
  { value: 'lines', label: 'Lines' },
  { value: 'blank', label: 'Blank' },
  { value: 'graph', label: 'Graph paper' },
  { value: 'coordinate', label: 'Coordinate grid' },
  { value: 'image', label: 'Custom image' },
];

const UPLOAD_BOX_IMAGE = '__upload';

/** Which image a custom image box prints: one of the quiz's images, or an upload. */
export const BoxImageSelect: React.FC<{
  image: PaperSheetStimulus | undefined;
  quizImages: readonly PaperSheetStimulus[];
  onPick: (image: PaperSheetStimulus) => void;
  /** Omit to offer only the quiz's own images. */
  onUpload?: () => void;
  ariaLabel: string;
  anchor: string;
}> = ({ image, quizImages, onPick, onUpload, ariaLabel, anchor }) => {
  const options =
    image && !quizImages.some((q) => q.id === image.id)
      ? [image, ...quizImages]
      : quizImages;
  return (
    <select
      aria-label={ariaLabel}
      {...tourFieldAttr('quiz-print.written-box-image', 'quiz', anchor)}
      value={image?.id ?? ''}
      onChange={(e) => {
        if (e.target.value === UPLOAD_BOX_IMAGE) return onUpload?.();
        const next = options.find((o) => o.id === e.target.value);
        if (next) onPick(next);
      }}
      className="min-w-0 max-w-[10rem] shrink rounded-lg border border-slate-200 px-2 py-1 text-sm"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
      {onUpload && <option value={UPLOAD_BOX_IMAGE}>Upload an image</option>}
    </select>
  );
};

/** What prints inside a written box. */
export const BoxStyleSelect: React.FC<{
  style: PaperBoxStyle;
  onChange: (style: PaperBoxStyle) => void;
  /** False leaves out Custom image. */
  allowImage?: boolean;
  ariaLabel: string;
  anchor: string;
}> = ({ style, onChange, allowImage = true, ariaLabel, anchor }) => (
  <select
    aria-label={ariaLabel}
    {...tourFieldAttr('quiz-print.written-box-style', 'quiz', anchor)}
    value={style}
    onChange={(e) => {
      const next = BOX_STYLE_OPTIONS.find((o) => o.value === e.target.value);
      if (next) onChange(next.value);
    }}
    className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-sm"
  >
    {BOX_STYLE_OPTIONS.filter((o) => allowImage || o.value !== 'image').map(
      (o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      )
    )}
  </select>
);

/** Box size menu, with a line count beside it once Custom is picked. */
export const BoxSizeSelect: React.FC<{
  size: PaperBoxSize;
  onChange: (size: PaperBoxSize) => void;
  ariaLabel: string;
  anchor: string;
}> = ({ size, onChange, ariaLabel, anchor }) => {
  const option = boxSizeOption(size);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <select
        aria-label={ariaLabel}
        {...tourFieldAttr('quiz-print.written-box-size', 'quiz', anchor)}
        value={option}
        onChange={(e) => {
          const next = e.target.value;
          onChange(
            next === 'custom'
              ? Math.min(paperBoxLines(size), PAPER_CUSTOM_MAX_LINES)
              : (next as PaperBoxSize)
          );
        }}
        className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
      >
        {BOX_SIZE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {option === 'custom' && (
        <>
          <input
            type="number"
            aria-label={`${ariaLabel}, lines`}
            {...tourFieldAttr('quiz-print.written-box-lines', 'quiz', anchor)}
            min={PAPER_CUSTOM_MIN_LINES}
            max={PAPER_CUSTOM_MAX_LINES}
            value={paperBoxLines(size)}
            onChange={(e) =>
              onChange(
                Math.max(
                  PAPER_CUSTOM_MIN_LINES,
                  Math.min(
                    PAPER_CUSTOM_MAX_LINES,
                    Math.round(Number(e.target.value)) || PAPER_CUSTOM_MIN_LINES
                  )
                )
              )
            }
            className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm"
          />
          <span className="text-xs text-slate-500">lines</span>
        </>
      )}
    </div>
  );
};

/** One written question: its text on its own line, its box controls under it. */
export const WrittenBoxRow: React.FC<{
  label: string | null;
  text: string;
  children: React.ReactNode;
}> = ({ label, text, children }) => (
  <li className="space-y-1.5 py-2">
    <p className="flex min-w-0 gap-1.5 text-sm text-slate-700">
      {label && <span className="shrink-0 font-semibold">{label}.</span>}
      <span className="line-clamp-2 min-w-0 flex-1" title={text}>
        {text}
      </span>
    </p>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </li>
);
