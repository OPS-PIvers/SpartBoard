/**
 * "Add to the answer sheet" — the only place paper sheet stimuli are authored
 * (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md D18). Collapsed until the teacher
 * opens it, so a teacher who never wants one never sees it.
 *
 * Presentational: the parent owns the list and the resolved image sources, so
 * the same sources back the preview here and the print itself.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Grid3x3,
  ImagePlus,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  PaperSheetStimulus,
  PaperSheetTemplate,
  QuizStimulus,
} from '@/types';
import {
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  STIMULUS_RECT_MM,
} from '@/utils/paperSheetLayout';
import {
  CAPTION_MAX_LENGTH,
  MAX_STIMULI_PER_PAGE,
  layoutSheetStimuli,
  stimuliOffTheEnd,
  stimuliOnPage,
} from '@/utils/paperSheetStimulusLayout';
import {
  renderTemplateSvg,
  templateLabel,
} from '@/utils/paperSheetTemplateSvg';

/** The five templates D9 specifies, with a starting point for each. */
const TEMPLATE_CHOICES: readonly PaperSheetTemplate[] = [
  {
    kind: 'coordinate-grid',
    quadrants: 4,
    min: -10,
    max: 10,
    step: 1,
    showNumbers: true,
  },
  {
    kind: 'coordinate-grid',
    quadrants: 1,
    min: 0,
    max: 10,
    step: 1,
    showNumbers: true,
  },
  { kind: 'number-line', min: 0, max: 10, step: 1 },
  { kind: 'graph-paper', heightMm: 80 },
  { kind: 'lined', heightMm: 64 },
  { kind: 'blank-box', heightMm: 60 },
];

const numberField = (
  label: string,
  value: number,
  onChange: (next: number) => void,
  extra: { min?: number; step?: number } = {}
): React.ReactNode => (
  <label key={label} className="flex items-center gap-1 text-xs text-slate-600">
    {label}
    <input
      type="number"
      value={value}
      aria-label={label}
      onChange={(e) => {
        const next = Number(e.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
      className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-xs"
      {...extra}
    />
  </label>
);

export interface PaperSheetStimuliSectionProps {
  stimuli: PaperSheetStimulus[];
  onChange: (next: PaperSheetStimulus[]) => void;
  /** Image stimuli already on the quiz, offered as "From this quiz" (D8). */
  quizImageStimuli: QuizStimulus[];
  /** Pages the sheet will have once these stimuli force a single column. */
  pageCount: number;
  /** Resolved `<img>` sources by stimulus id; drives the preview. */
  imageSrc: Record<string, string>;
  /** Stimuli whose image could not be fetched. */
  failed: PaperSheetStimulus[];
  /** Images a PLC teammate cannot open yet (D6); empty outside a PLC. */
  unshared?: PaperSheetStimulus[];
  /** Upload a picked file and return the stimulus it became, or null. */
  onUploadFile: (file: File) => Promise<PaperSheetStimulus | null>;
  /** Open the Drive picker and return the chosen file as a stimulus. */
  onPickFromDrive: () => Promise<PaperSheetStimulus | null>;
  busy: boolean;
  disabled?: boolean;
}

/** The parameters D9 gives each template, edited in place on its row. */
function templateFields(
  template: PaperSheetTemplate,
  onChange: (next: PaperSheetTemplate) => void
): React.ReactNode {
  switch (template.kind) {
    case 'coordinate-grid':
      return (
        <>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            Quadrants
            <select
              value={template.quadrants}
              aria-label="Quadrants"
              onChange={(e) => {
                const quadrants = Number(e.target.value) === 1 ? 1 : 4;
                onChange({
                  ...template,
                  quadrants,
                  // One quadrant starts at the origin, whatever was typed.
                  min: quadrants === 1 ? 0 : Math.min(template.min, 0),
                });
              }}
              className="rounded border border-slate-200 px-1.5 py-0.5 text-xs"
            >
              <option value={1}>1</option>
              <option value={4}>4</option>
            </select>
          </label>
          {template.quadrants === 4 &&
            numberField('Lowest', template.min, (min) =>
              onChange({ ...template, min })
            )}
          {numberField('Highest', template.max, (max) =>
            onChange({ ...template, max })
          )}
          {numberField(
            'Step',
            template.step,
            (step) => onChange({ ...template, step }),
            { min: 0 }
          )}
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={template.showNumbers}
              onChange={(e) =>
                onChange({ ...template, showNumbers: e.target.checked })
              }
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Number the axes
          </label>
        </>
      );
    case 'number-line':
      return (
        <>
          {numberField('Lowest', template.min, (min) =>
            onChange({ ...template, min })
          )}
          {numberField('Highest', template.max, (max) =>
            onChange({ ...template, max })
          )}
          {numberField(
            'Step',
            template.step,
            (step) => onChange({ ...template, step }),
            { min: 0 }
          )}
        </>
      );
    default:
      return numberField(
        'Height (mm)',
        template.heightMm,
        (heightMm) => onChange({ ...template, heightMm }),
        { min: 10, step: 5 }
      );
  }
}

const pct = (value: number, total: number): string =>
  `${((value / total) * 100).toFixed(3)}%`;

/** Page 1 as the copier will produce it, at thumbnail scale. */
const SheetPreview: React.FC<{
  stimuli: PaperSheetStimulus[];
  imageSrc: Record<string, string>;
}> = ({ stimuli, imageSrc }) => {
  const layout = layoutSheetStimuli(stimuli, 1);
  return (
    <div
      className="relative w-32 shrink-0 overflow-hidden rounded border border-slate-300 bg-white"
      style={{ aspectRatio: `${PAGE_WIDTH_MM} / ${PAGE_HEIGHT_MM}` }}
      aria-hidden
    >
      <div
        className="absolute border border-dashed border-slate-200"
        style={{
          left: pct(STIMULUS_RECT_MM.x, PAGE_WIDTH_MM),
          top: pct(STIMULUS_RECT_MM.y, PAGE_HEIGHT_MM),
          width: pct(STIMULUS_RECT_MM.w, PAGE_WIDTH_MM),
          height: pct(STIMULUS_RECT_MM.h, PAGE_HEIGHT_MM),
        }}
      />
      {/* The answer column, as bars, so the teacher sees what the band is beside. */}
      {Array.from({ length: 25 }, (_, i) => (
        <div
          key={i}
          className="absolute bg-slate-200"
          style={{
            left: pct(24, PAGE_WIDTH_MM),
            top: pct(58 + i * 8, PAGE_HEIGHT_MM),
            width: pct(49, PAGE_WIDTH_MM),
            height: pct(3, PAGE_HEIGHT_MM),
          }}
        />
      ))}
      {layout.items.map((item) => {
        const src = imageSrc[item.stimulus.id];
        return (
          <div
            key={item.stimulus.id}
            className="absolute overflow-hidden bg-slate-100"
            style={{
              left: pct(item.rect.x, PAGE_WIDTH_MM),
              top: pct(item.rect.y, PAGE_HEIGHT_MM),
              width: pct(item.rect.w, PAGE_WIDTH_MM),
              height: pct(item.rect.h, PAGE_HEIGHT_MM),
            }}
          >
            {src && (
              <img
                src={src}
                alt=""
                className="h-full w-full object-contain"
                draggable={false}
              />
            )}
            {item.stimulus.source === 'template' && item.stimulus.template && (
              <div
                className="h-full w-full"
                // Generated from the template's own numbers; no user text.
                dangerouslySetInnerHTML={{
                  __html: renderTemplateSvg(
                    item.stimulus.template,
                    item.rect.w,
                    item.rect.h
                  ),
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const PaperSheetStimuliSection: React.FC<
  PaperSheetStimuliSectionProps
> = ({
  stimuli,
  onChange,
  quizImageStimuli,
  pageCount,
  imageSrc,
  failed,
  unshared = [],
  onUploadFile,
  onPickFromDrive,
  busy,
  disabled = false,
}) => {
  const [open, setOpen] = useState(stimuli.length > 0);
  const [showQuizPicker, setShowQuizPicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const add = (stimulus: PaperSheetStimulus | null) => {
    if (stimulus) onChange([...stimuli, stimulus]);
  };

  const update = (id: string, patch: Partial<PaperSheetStimulus>) => {
    onChange(stimuli.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const move = (index: number, by: number) => {
    const next = [...stimuli];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  // Ctrl/Cmd+V anywhere in the modal adds the clipboard image, the same
  // capture-phase pattern the Guided Learning editor uses so the Dock's
  // global smart-paste handler does not also fire.
  useEffect(() => {
    if (!open || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const image = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith('image/')
      );
      if (!image) return;
      e.preventDefault();
      void onUploadFile(image).then(add);
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
    // `add` closes over the current list, which is what a paste should append to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, disabled, onUploadFile, stimuli]);

  const offTheEnd = stimuliOffTheEnd(stimuli, pageCount);
  const overCap = Array.from({ length: pageCount }, (_, i) =>
    stimuliOnPage(stimuli, i + 1)
  ).some((p) => p.dropped.length > 0);
  const failedIds = new Set(failed.map((s) => s.id));

  return (
    <div className="rounded-xl border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <span className="flex-1 text-sm font-semibold text-slate-800">
          Add to the answer sheet
        </span>
        <span className="text-xs text-slate-500">
          {stimuli.length === 0
            ? 'Nothing yet'
            : `${stimuli.length} item${stimuli.length === 1 ? '' : 's'}`}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 pb-3 pt-3">
          <p className="text-xs text-slate-600">
            Adding anything here drops the sheet to 25 questions a page.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void onUploadFile(file).then(add);
              }}
            />
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload or PDF
            </button>
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => void onPickFromDrive().then(add)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              From Drive
            </button>
            {quizImageStimuli.length > 0 && (
              <button
                type="button"
                disabled={busy || disabled}
                onClick={() => setShowQuizPicker((v) => !v)}
                aria-expanded={showQuizPicker}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                From this quiz
              </button>
            )}
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => setShowTemplatePicker((v) => !v)}
              aria-expanded={showTemplatePicker}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <Grid3x3 className="h-3.5 w-3.5" />
              Grid or lines
            </button>
            <span className="text-xs text-slate-500">
              or paste an image with{' '}
              {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
              +V
            </span>
          </div>

          {showTemplatePicker && (
            <ul className="space-y-1 rounded-lg border border-slate-200 p-2">
              {TEMPLATE_CHOICES.map((template) => (
                <li key={templateLabel(template)}>
                  <button
                    type="button"
                    onClick={() => {
                      add({
                        id: crypto.randomUUID(),
                        label: templateLabel(template),
                        source: 'template',
                        template,
                      });
                      setShowTemplatePicker(false);
                    }}
                    className="w-full truncate rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    {templateLabel(template)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showQuizPicker && (
            <ul className="space-y-1 rounded-lg border border-slate-200 p-2">
              {quizImageStimuli.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      add({
                        id: crypto.randomUUID(),
                        label: s.label,
                        source: 'image',
                        ...(s.driveFileId
                          ? { driveFileId: s.driveFileId }
                          : {}),
                        ...(s.url ? { url: s.url } : {}),
                      });
                      setShowQuizPicker(false);
                    }}
                    className="w-full truncate rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {stimuli.length > 0 && (
            <div className="flex gap-3">
              <SheetPreview stimuli={stimuli} imageSrc={imageSrc} />
              <ul className="min-w-0 flex-1 space-y-2">
                {stimuli.map((stimulus, index) => (
                  <li
                    key={stimulus.id}
                    className="rounded-lg border border-slate-200 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
                        {stimulus.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${stimulus.label} up`}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === stimuli.length - 1}
                        aria-label={`Move ${stimulus.label} down`}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChange(stimuli.filter((s) => s.id !== stimulus.id))
                        }
                        aria-label={`Remove ${stimulus.label}`}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {failedIds.has(stimulus.id) && (
                      <p className="mt-1 text-xs font-semibold text-rose-700">
                        Could not load this image, so it will not print.
                      </p>
                    )}
                    {stimulus.template && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {templateFields(stimulus.template, (template) =>
                          update(stimulus.id, {
                            template,
                            label: templateLabel(template),
                          })
                        )}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        type="text"
                        value={stimulus.caption ?? ''}
                        maxLength={CAPTION_MAX_LENGTH}
                        placeholder="Caption (optional)"
                        aria-label={`Caption for ${stimulus.label}`}
                        onChange={(e) =>
                          update(stimulus.id, { caption: e.target.value })
                        }
                        className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                      <select
                        value={stimulus.page ?? 0}
                        aria-label={`Pages for ${stimulus.label}`}
                        onChange={(e) => {
                          const page = Number(e.target.value);
                          update(stimulus.id, {
                            page: page === 0 ? undefined : page,
                          });
                        }}
                        className="rounded border border-slate-200 px-2 py-1 text-xs"
                      >
                        <option value={0}>Every page</option>
                        {Array.from({ length: pageCount }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            Page {i + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {unshared.length > 0 && (
            <p className="text-xs text-slate-600">
              {unshared.map((s) => s.label).join(', ')}{' '}
              {unshared.length === 1 ? 'is' : 'are'} only visible to you. Share{' '}
              {unshared.length === 1 ? 'it' : 'them'} when you print so your PLC
              sees {unshared.length === 1 ? 'it' : 'them'}.
            </p>
          )}
          {offTheEnd.length > 0 && (
            <p className="text-xs font-semibold text-amber-800">
              {offTheEnd.map((s) => s.label).join(', ')}{' '}
              {offTheEnd.length === 1 ? 'is' : 'are'} pinned to a page this test
              no longer has. Pick another page or{' '}
              {offTheEnd.length === 1 ? 'it' : 'they'} will not print.
            </p>
          )}
          {overCap && (
            <p className="text-xs font-semibold text-amber-800">
              A page prints at most {MAX_STIMULI_PER_PAGE} of these, so move
              some to another page.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
