import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardPaste, Eye, ImagePlus, Loader2, X } from 'lucide-react';
import type {
  WhiteboardStartingPattern,
  WhiteboardShapeKind,
  WhiteboardStartingPage,
  WhiteboardStartingImage,
} from '@/types';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { driveImageUrl } from '@/utils/quizStimuli';
import { labelClass, inputClass } from './quizEditorFieldStyles';
import { DraftNumberInput } from './DraftNumberInput';
import {
  BLANK_STARTING_PAGE,
  clampPattern,
  defaultPattern,
} from './whiteboardStartingPageSpec';
import { WhiteboardStartingPagePreviewModal } from './WhiteboardStartingPagePreviewModal';

const isTextEntryTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement &&
      !['button', 'checkbox', 'radio', 'range', 'file'].includes(target.type)));

const imageFromClipboard = (data: DataTransfer | null): File | undefined =>
  Array.from(data?.files ?? []).find((f) => f.type.startsWith('image/'));

/** Reads an image off the clipboard from a button press; null when there is none or the browser refuses. */
async function readClipboardImage(): Promise<File | null> {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (!type) continue;
      const blob = await item.getType(type);
      return new File([blob], `pasted.${type.split('/')[1] ?? 'png'}`, {
        type,
      });
    }
  } catch {
    // Permission refused or the Clipboard API is missing.
  }
  return null;
}

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

export interface WhiteboardStartingPagePickerProps {
  value: WhiteboardStartingPage | undefined;
  onChange: (next: WhiteboardStartingPage) => void;
  /** Uploads through the quiz-stimulus Drive path; null when cancelled. */
  onUploadImage: (file: File) => Promise<WhiteboardStartingImage | null>;
  resolveImageUrl?: (driveFileId: string) => string;
}

export const WhiteboardStartingPagePicker: React.FC<
  WhiteboardStartingPagePickerProps
> = ({ value, onChange, onUploadImage, resolveImageUrl = driveImageUrl }) => {
  const { t } = useTranslation();
  const tk = (key: string) =>
    t(`quizMediaResponse.authoring.whiteboard.${key}`);
  const page = value ?? BLANK_STARTING_PAGE;
  const pattern = page.pattern;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pasteMissed, setPasteMissed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const setPattern = (next: WhiteboardStartingPattern) =>
    onChange({ ...page, pattern: clampPattern(next) });

  const handleFile = async (file: File | undefined) => {
    if (!file || uploading) return;
    setPasteMissed(false);
    setUploading(true);
    try {
      const image = await onUploadImage(file);
      if (image) onChange({ ...page, image });
    } finally {
      setUploading(false);
    }
  };
  const onImageFile = useEffectEvent((file: File) => {
    void handleFile(file);
  });

  // Ctrl+V anywhere in the editor adds the image, unless the teacher is pasting into a text field.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTextEntryTarget(e.target)) return;
      const file = imageFromClipboard(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      onImageFile(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  const pasteFromClipboard = async () => {
    const file = await readClipboardImage();
    if (file) void handleFile(file);
    else setPasteMissed(true);
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
    <div className="w-24">
      <label className={labelClass} htmlFor={`wb-${field}`}>
        {label}
      </label>
      <DraftNumberInput
        id={`wb-${field}`}
        value={current}
        step={step}
        commitWhileTyping={false}
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
    <div className="space-y-3 min-w-0">
      <div className="space-y-3 min-w-0">
        <div className="max-w-[16rem]">
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
          <div className="flex flex-wrap gap-2">
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
          <div className="flex flex-wrap gap-2">
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
          <button
            type="button"
            disabled={uploading}
            onClick={() => void pasteFromClipboard()}
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-bold text-brand-blue-primary hover:text-brand-blue-dark disabled:opacity-60"
            {...tourTypeAttr('quiz-editor.whiteboard-image-paste', 'quiz')}
          >
            <ClipboardPaste className="h-4 w-4" aria-hidden />
            {tk('pasteImage')}
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
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-bold text-brand-blue-primary hover:text-brand-blue-dark"
            {...tourTypeAttr('quiz-editor.whiteboard-preview', 'quiz')}
          >
            <Eye className="h-4 w-4" aria-hidden />
            {tk('previewPage')}
          </button>
        </div>
        {pasteMissed && (
          <p role="status" className="text-xs text-slate-600">
            {tk('pasteImageEmpty')}
          </p>
        )}
      </div>

      {previewOpen && (
        <WhiteboardStartingPagePreviewModal
          page={page}
          resolveImageUrl={resolveImageUrl}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
};
