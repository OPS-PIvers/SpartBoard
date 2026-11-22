// Written box controls (page count, paper type, image) shared by Assign on paper and the assign stepper.
import React from 'react';
import { ChevronDown } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { PaperBoxSize, PaperBoxStyle, PaperSheetStimulus } from '@/types';
import {
  PAPER_BOX_LINES,
  PAPER_CUSTOM_MAX_LINES,
  PAPER_CUSTOM_MIN_LINES,
  paperBoxLines,
  paperBoxPages,
  paperBoxSizeForPages,
} from '@/utils/paperWritten';

const BOX_SIZE_OPTIONS = [
  { value: 'S', label: `Short answer (${PAPER_BOX_LINES.S} lines)` },
  { value: 'M', label: `1 paragraph (${PAPER_BOX_LINES.M} lines)` },
  { value: 'full', label: 'Pages' },
  { value: 'custom', label: 'Set lines' },
] as const;

/** A box size as the menu shows it: a named size, Pages for whole pages, or Set lines for a line count (and the older Large). */
const boxSizeOption = (size: PaperBoxSize): string => {
  if (size === 'S' || size === 'M') return size;
  return size === 'full' || paperBoxPages(size) > 1 ? 'full' : 'custom';
};

const BOX_STYLE_OPTIONS: readonly { value: PaperBoxStyle; label: string }[] = [
  { value: 'lines', label: 'Lines' },
  { value: 'blank', label: 'Blank' },
  { value: 'graph', label: 'Graph paper' },
  { value: 'coordinate', label: 'Coordinate grid' },
  { value: 'image', label: 'Custom image' },
];

const UPLOAD_BOX_IMAGE = '__upload';

const SELECT_CLASS =
  'h-8 min-w-0 max-w-full appearance-none truncate rounded-lg border border-slate-300 bg-white pl-2.5 pr-7 text-sm text-slate-700 hover:border-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/30';
const NUMBER_CLASS =
  'h-8 w-14 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700';

/** A select drawn like the assign stepper's menu buttons, chevron included. */
const MenuSelect: React.FC<{
  className: string;
  children: React.ReactElement<React.ComponentProps<'select'>>;
}> = ({ className, children }) => (
  <div className={`relative ${className}`}>
    {children}
    <ChevronDown
      className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
      aria-hidden="true"
    />
  </div>
);

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
    <MenuSelect className="min-w-0 max-w-[12rem] shrink">
      <select
        aria-label={ariaLabel}
        {...tourFieldAttr('quiz-print.written-box-image', 'quiz', anchor)}
        value={image?.id ?? ''}
        onChange={(e) => {
          if (e.target.value === UPLOAD_BOX_IMAGE) return onUpload?.();
          const next = options.find((o) => o.id === e.target.value);
          if (next) onPick(next);
        }}
        className={SELECT_CLASS}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
        {onUpload && <option value={UPLOAD_BOX_IMAGE}>Upload an image</option>}
      </select>
    </MenuSelect>
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
  <MenuSelect className="shrink-0">
    <select
      aria-label={ariaLabel}
      {...tourFieldAttr('quiz-print.written-box-style', 'quiz', anchor)}
      value={style}
      onChange={(e) => {
        const next = BOX_STYLE_OPTIONS.find((o) => o.value === e.target.value);
        if (next) onChange(next.value);
      }}
      className={SELECT_CLASS}
    >
      {BOX_STYLE_OPTIONS.filter((o) => allowImage || o.value !== 'image').map(
        (o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        )
      )}
    </select>
  </MenuSelect>
);

/** Box size menu, with a line count beside it once Custom is picked. */
export const BoxSizeSelect: React.FC<{
  size: PaperBoxSize;
  onChange: (size: PaperBoxSize) => void;
  ariaLabel: string;
  anchor: string;
  /** Most pages a box can take; 1 hides the page count. */
  maxPages?: number;
}> = ({ size, onChange, ariaLabel, anchor, maxPages = 1 }) => {
  const option = boxSizeOption(size);
  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <MenuSelect className="shrink-0">
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
          className={SELECT_CLASS}
        >
          {BOX_SIZE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </MenuSelect>
      {option === 'full' && (maxPages > 1 || paperBoxPages(size) > 1) && (
        <>
          <input
            type="number"
            aria-label={`${ariaLabel}, pages`}
            {...tourFieldAttr('quiz-print.written-box-pages', 'quiz', anchor)}
            min={1}
            max={Math.max(maxPages, paperBoxPages(size))}
            value={paperBoxPages(size)}
            onChange={(e) =>
              onChange(
                paperBoxSizeForPages(
                  Math.min(
                    Math.max(maxPages, paperBoxPages(size)),
                    Number(e.target.value) || 1
                  )
                )
              )
            }
            className={NUMBER_CLASS}
          />
          <span className="text-xs text-slate-500">pages</span>
        </>
      )}
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
            className={NUMBER_CLASS}
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
