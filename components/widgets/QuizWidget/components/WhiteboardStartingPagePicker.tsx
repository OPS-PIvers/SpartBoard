import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Loader2, X } from 'lucide-react';
import type {
  WhiteboardStartingPattern,
  WhiteboardShapeKind,
  WhiteboardStartingPage,
  WhiteboardStartingImage,
} from '@/types';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import {
  drawStartingPage,
  PAGE_H,
  PAGE_W,
} from '@/utils/whiteboard/startingPage';
import { labelClass, inputClass } from './quizEditorFieldStyles';
import {
  BLANK_STARTING_PAGE,
  clampPattern,
  defaultPattern,
} from './whiteboardStartingPageSpec';

type PatternKind = WhiteboardStartingPattern['kind'];

const PATTERN_ORDER: PatternKind[] = [
  'blank',
  'grid',
  'lines',
  'dots',
  'coordinate-plane',
  'number-line',
  'shape',
];

const SHAPE_ORDER: WhiteboardShapeKind[] = [
  'triangle',
  'rectangle',
  'circle',
  'polygon',
];

const PREVIEW_SCALE = 0.4;

/** Number input that commits on blur or Enter, so typing "-" or "0." is not clobbered. */
const DraftNumberInput: React.FC<{
  id: string;
  value: number;
  onCommit: (n: number) => void;
  step?: number;
  anchor: ReturnType<typeof tourFieldAttr>;
}> = ({ id, value, onCommit, step, anchor }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = parseFloat(draft);
    setDraft(null);
    if (Number.isFinite(n) && n !== value) onCommit(n);
  };
  return (
    <input
      id={id}
      type="number"
      step={step}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      className={inputClass}
      {...anchor}
    />
  );
};

export interface WhiteboardStartingPagePickerProps {
  value: WhiteboardStartingPage | undefined;
  onChange: (next: WhiteboardStartingPage) => void;
  /** Uploads through the quiz-stimulus Drive path; null when cancelled. */
  onUploadImage: (file: File) => Promise<WhiteboardStartingImage | null>;
}

export const WhiteboardStartingPagePicker: React.FC<
  WhiteboardStartingPagePickerProps
> = ({ value, onChange, onUploadImage }) => {
  const { t } = useTranslation();
  const tk = (key: string) =>
    t(`quizMediaResponse.authoring.whiteboard.${key}`);
  const page = value ?? BLANK_STARTING_PAGE;
  const pattern = page.pattern;
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [uploading, setUploading] = useState(false);
  const [loadedImage, setLoadedImage] = useState<{
    url: string;
    el: HTMLImageElement;
  } | null>(null);

  const setPattern = (next: WhiteboardStartingPattern) =>
    onChange({ ...page, pattern: clampPattern(next) });

  const imageUrl = page.image?.url;
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    let live = true;
    img.onload = () => {
      if (live) setLoadedImage({ url: imageUrl, el: img });
    };
    img.src = imageUrl;
    return () => {
      live = false;
    };
  }, [imageUrl]);
  const previewImage =
    imageUrl && loadedImage?.url === imageUrl ? loadedImage.el : null;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    drawStartingPage(ctx, page, previewImage);
  }, [page, previewImage]);

  const handleFile = async (file: File | undefined) => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const image = await onUploadImage(file);
      if (image) onChange({ ...page, image });
    } finally {
      setUploading(false);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files).find((f) =>
      f.type.startsWith('image/')
    );
    if (!file) return;
    e.preventDefault();
    void handleFile(file);
  };

  const removeImage = () => {
    const { image: _drop, ...rest } = page;
    onChange(rest);
  };

  const num = (
    field: string,
    label: string,
    current: number,
    apply: (n: number) => WhiteboardStartingPattern,
    step?: number
  ) => (
    <div>
      <label className={labelClass} htmlFor={`wb-${field}`}>
        {label}
      </label>
      <DraftNumberInput
        id={`wb-${field}`}
        value={current}
        step={step}
        onCommit={(n) => setPattern(apply(n))}
        anchor={tourFieldAttr(
          'quiz-editor.whiteboard-pattern-value',
          'quiz',
          field
        )}
      />
    </div>
  );

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-4"
      onPaste={onPaste}
    >
      <div className="space-y-3 min-w-0">
        <div>
          <label className={labelClass} htmlFor="wb-starting-page">
            {tk('startingPageLabel')}
          </label>
          <select
            id="wb-starting-page"
            value={pattern.kind}
            onChange={(e) =>
              setPattern(defaultPattern(e.target.value as PatternKind))
            }
            className={`${inputClass} appearance-none`}
            {...tourTypeAttr('quiz-editor.whiteboard-starting-page', 'quiz')}
          >
            {PATTERN_ORDER.map((kind) => (
              <option key={kind} value={kind}>
                {tk(`pattern.${kind}`)}
              </option>
            ))}
          </select>
        </div>

        {pattern.kind === 'coordinate-plane' && (
          <div className="grid grid-cols-4 gap-2">
            {num('xMin', tk('xFrom'), pattern.xMin, (n) => ({
              ...pattern,
              xMin: n,
            }))}
            {num('xMax', tk('xTo'), pattern.xMax, (n) => ({
              ...pattern,
              xMax: n,
            }))}
            {num('yMin', tk('yFrom'), pattern.yMin, (n) => ({
              ...pattern,
              yMin: n,
            }))}
            {num('yMax', tk('yTo'), pattern.yMax, (n) => ({
              ...pattern,
              yMax: n,
            }))}
          </div>
        )}

        {pattern.kind === 'number-line' && (
          <div className="grid grid-cols-3 gap-2">
            {num('min', tk('from'), pattern.min, (n) => ({
              ...pattern,
              min: n,
            }))}
            {num('max', tk('to'), pattern.max, (n) => ({ ...pattern, max: n }))}
            {num(
              'step',
              tk('step'),
              pattern.step,
              (n) => ({ ...pattern, step: n }),
              0.5
            )}
          </div>
        )}

        {pattern.kind === 'shape' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} htmlFor="wb-shape">
                {tk('shapeLabel')}
              </label>
              <select
                id="wb-shape"
                value={pattern.shape}
                onChange={(e) =>
                  setPattern({
                    kind: 'shape',
                    shape: e.target.value as WhiteboardShapeKind,
                  })
                }
                className={`${inputClass} appearance-none`}
                {...tourTypeAttr('quiz-editor.whiteboard-shape', 'quiz')}
              >
                {SHAPE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {tk(`shape.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            {pattern.shape === 'polygon' &&
              num('sides', tk('sides'), pattern.sides ?? 6, (n) => ({
                ...pattern,
                sides: n,
              }))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            // no-tour-anchor: hidden input opened by the image button
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            title={tk('imagePasteHint')}
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-bold text-brand-blue-primary hover:text-brand-blue-dark disabled:opacity-60"
            {...tourTypeAttr('quiz-editor.whiteboard-image', 'quiz')}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="h-4 w-4" aria-hidden />
            )}
            {page.image ? tk('replaceImage') : tk('addImage')}
          </button>
          {page.image && (
            <button
              type="button"
              onClick={removeImage}
              className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-slate-600 hover:text-slate-900"
              {...tourTypeAttr('quiz-editor.whiteboard-image-remove', 'quiz')}
            >
              <X className="h-4 w-4" aria-hidden />
              {tk('removeImage')}
            </button>
          )}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={PAGE_W * PREVIEW_SCALE}
        height={PAGE_H * PREVIEW_SCALE}
        role="img"
        aria-label={tk('previewLabel')}
        className="w-48 aspect-[4/3] rounded-lg border border-slate-200 bg-white self-start"
      />
    </div>
  );
};
