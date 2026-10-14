import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, ImagePlus } from 'lucide-react';
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
import { WhiteboardInsertImageModal } from './WhiteboardInsertImageModal';

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
  const [insertOpen, setInsertOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const setPattern = (next: WhiteboardStartingPattern) =>
    onChange({ ...page, pattern: clampPattern(next) });

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
        <label className={labelClass} htmlFor="wb-starting-page">
          {tk('startingPageLabel')}
        </label>
        <div className="flex items-center gap-2">
          <select
            id="wb-starting-page"
            value={pattern.kind}
            onChange={(e) =>
              setPattern(defaultPattern(e.target.value as PatternKind))
            }
            className={`${inputClass} appearance-none min-w-0 flex-1 max-w-[16rem]`}
            {...tourTypeAttr('quiz-editor.whiteboard-starting-page', 'quiz')}
          >
            {PATTERN_ORDER.map((kind) => (
              <option key={kind} value={kind}>
                {tk(`pattern.${kind}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setInsertOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-brand-blue-primary hover:bg-slate-50"
            {...tourTypeAttr('quiz-editor.whiteboard-image', 'quiz')}
          >
            <ImagePlus className="h-4 w-4" aria-hidden />
            {tk('insertImage')}
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-brand-blue-primary hover:bg-slate-50"
            {...tourTypeAttr('quiz-editor.whiteboard-preview', 'quiz')}
          >
            <Eye className="h-4 w-4" aria-hidden />
            {tk('previewPage')}
          </button>
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
      </div>

      {insertOpen && (
        <WhiteboardInsertImageModal
          image={page.image}
          onUploadImage={onUploadImage}
          onInsert={(image) => onChange({ ...page, image })}
          onRemove={removeImage}
          resolveImageUrl={resolveImageUrl}
          onClose={() => setInsertOpen(false)}
        />
      )}
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
