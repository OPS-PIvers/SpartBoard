import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardPaste, Copy, CopyPlus, Film, Plus } from 'lucide-react';
import { SortableList } from '@/components/common/SortableList';
import {
  thumbnailUrl,
  type GuidedLearningMediaKind,
} from '@/utils/guidedLearningMedia';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';
import { stepsInIdOrder } from './timelineOrder';
import { StudioMenu } from './StudioMenu';
import { modShortcutLabel } from './useStudioShortcuts';

interface StepChip {
  id: string;
  n: number;
  label: string;
  slide: number;
  /** First step of a run of consecutive steps on one slide. */
  runStart: boolean;
}

interface RunSlide {
  thumb: string;
  kind: GuidedLearningMediaKind;
}

const getChipId = (c: StepChip) => c.id;

const sameChips = (a: StepChip[], b: StepChip[]) =>
  a.length === b.length &&
  a.every(
    (c, i) =>
      c.id === b[i].id &&
      c.n === b[i].n &&
      c.label === b[i].label &&
      c.slide === b[i].slide &&
      c.runStart === b[i].runStart
  );

const sameSlides = (a: RunSlide[], b: RunSlide[]) =>
  a.length === b.length &&
  a.every((s, i) => s.thumb === b[i].thumb && s.kind === b[i].kind);

interface TimelineBodyProps {
  chips: StepChip[];
  slides: RunSlide[];
  currentImageIndex: number;
  selectedStepId: string | null;
  addingStep: boolean;
  setSelectedStepId: GuidedLearningEditorController['setSelectedStepId'];
  setCurrentImageIndex: GuidedLearningEditorController['setCurrentImageIndex'];
  setAddingStep: GuidedLearningEditorController['setAddingStep'];
  onReorder: (ids: string[]) => void;
  onDuplicateStep: (id: string) => void;
  onCopyStep: (id: string) => void;
  onPasteSteps: () => void;
  clipboardStepCount: number;
}

const sameBodyProps = (a: TimelineBodyProps, b: TimelineBodyProps) =>
  (Object.keys(a) as (keyof TimelineBodyProps)[]).every((k) =>
    k === 'chips'
      ? sameChips(a.chips, b.chips)
      : k === 'slides'
        ? sameSlides(a.slides, b.slides)
        : Object.is(a[k], b[k])
  );

// Typing in a step changes no chip, so the strip skips those renders.
const TimelineBody = React.memo(function TimelineBody({
  chips,
  slides,
  currentImageIndex,
  selectedStepId,
  addingStep,
  setSelectedStepId,
  setCurrentImageIndex,
  setAddingStep,
  onReorder,
  onDuplicateStep,
  onCopyStep,
  onPasteSteps,
  clipboardStepCount,
}: TimelineBodyProps) {
  const { t } = useTranslation();

  if (slides.length === 0) return null;

  return (
    <section
      aria-label={t('glStudio.playOrder')}
      className="flex shrink-0 items-center gap-3 border-t border-slate-200 bg-white px-4 py-2.5"
    >
      <span className="shrink-0 text-xxs font-bold uppercase tracking-wider text-slate-500">
        {t('glStudio.playOrder')}
      </span>
      <div className="min-w-0 flex-1 overflow-x-auto custom-scrollbar">
        {chips.length === 0 ? (
          <p className="text-xs text-slate-500">{t('glStudio.noStepsYet')}</p>
        ) : (
          <SortableList
            items={chips}
            getId={getChipId}
            onReorder={(next) => onReorder(next.map((c) => c.id))}
            layout="grid"
            className="flex items-center gap-1.5"
            renderItem={(s, handle, index) => {
              const { n, label } = s;
              const selected = s.id === selectedStepId;
              const onSlide = s.slide === currentImageIndex;
              const slide = slides[s.slide];
              return (
                <div
                  className={`flex items-center gap-1.5 ${
                    s.runStart && index > 0
                      ? 'ml-1.5 border-l border-slate-200 pl-3'
                      : ''
                  }`}
                >
                  {s.runStart && (
                    <button
                      type="button"
                      onClick={() => setCurrentImageIndex(s.slide)}
                      aria-current={onSlide}
                      aria-label={t('glStudio.goToSlideN', { n: s.slide + 1 })}
                      title={t('glStudio.slideN', { n: s.slide + 1 })}
                      className={`relative h-8 w-14 shrink-0 overflow-hidden rounded border-2 bg-slate-900 ${
                        onSlide
                          ? 'border-brand-blue-primary'
                          : 'border-transparent hover:border-slate-300'
                      }`}
                    >
                      {slide?.kind === 'video' ? (
                        <Film
                          className="absolute inset-0 m-auto h-4 w-4 text-white"
                          aria-hidden="true"
                        />
                      ) : slide ? (
                        <img
                          src={slide.thumb}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          className="pointer-events-none h-full w-full object-contain"
                        />
                      ) : null}
                      <span className="absolute left-0.5 top-0.5 rounded bg-slate-900/80 px-1 text-xxs font-bold leading-tight text-white">
                        {s.slide + 1}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    {...handle.attributes}
                    onPointerDown={
                      handle.listeners?.onPointerDown as
                        | React.PointerEventHandler<HTMLButtonElement>
                        | undefined
                    }
                    onClick={() => {
                      setSelectedStepId(s.id);
                      setCurrentImageIndex(s.slide);
                    }}
                    aria-pressed={selected}
                    aria-label={
                      label
                        ? t('glStudio.stepNLabelled', { n, label })
                        : t('glStudio.stepN', { n })
                    }
                    className={`flex max-w-[180px] shrink-0 cursor-grab touch-none items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-bold transition-colors active:cursor-grabbing ${
                      selected
                        ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                        : onSlide
                          ? 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                          : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-400'
                    }`}
                  >
                    <span className="font-mono">{n}</span>
                    {label && (
                      <span className="truncate font-medium">{label}</span>
                    )}
                  </button>
                </div>
              );
            }}
          />
        )}
      </div>
      <StudioMenu
        label={t('glStudio.stepActions')}
        testId="gl-studio-step-menu"
        triggerClassName="flex shrink-0 items-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 transition-colors hover:border-slate-400"
        items={[
          {
            id: 'duplicate',
            label: t('glStudio.duplicateStep'),
            icon: CopyPlus,
            hint: modShortcutLabel('d'),
            disabled: selectedStepId === null,
            onSelect: () => {
              if (selectedStepId) onDuplicateStep(selectedStepId);
            },
          },
          {
            id: 'copy',
            label: t('glStudio.copyStep'),
            icon: Copy,
            hint: modShortcutLabel('c'),
            disabled: selectedStepId === null,
            onSelect: () => {
              if (selectedStepId) onCopyStep(selectedStepId);
            },
          },
          {
            id: 'paste',
            label: t('glStudio.pasteSteps'),
            icon: ClipboardPaste,
            hint: modShortcutLabel('v'),
            disabled: clipboardStepCount === 0,
            onSelect: onPasteSteps,
          },
        ]}
      />
      <button
        type="button"
        onClick={() => {
          setSelectedStepId(null);
          setAddingStep(!addingStep);
        }}
        aria-pressed={addingStep}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${
          addingStep
            ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
            : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
        }`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {addingStep ? t('glStudio.clickToPlace') : t('glStudio.addStep')}
      </button>
    </section>
  );
}, sameBodyProps);

interface StudioTimelineProps {
  state: GuidedLearningEditorController;
  /** Copies a step; the Studio passes one that confirms with a toast. */
  onCopyStep?: (id: string) => void;
}

/** Bottom strip: every step in play order, grouped into runs per slide. */
export const StudioTimeline: React.FC<StudioTimelineProps> = ({
  state,
  onCopyStep,
}) => {
  const {
    steps,
    setSteps,
    imageUrls,
    imageKinds,
    slideThumbnails,
    copySteps,
    pasteSteps,
  } = state;

  const chips = useMemo<StepChip[]>(
    () =>
      steps.map((s, i) => ({
        id: s.id,
        n: i + 1,
        label: s.label?.trim() ?? '',
        slide: s.imageIndex,
        runStart: i === 0 || steps[i - 1].imageIndex !== s.imageIndex,
      })),
    [steps]
  );

  const slides = useMemo<RunSlide[]>(
    () =>
      imageUrls.map((url, i) => ({
        thumb: thumbnailUrl(url, slideThumbnails),
        kind: imageKinds[i] ?? 'image',
      })),
    [imageUrls, imageKinds, slideThumbnails]
  );

  // Works on the latest steps, so the memoized body can hold an older callback.
  const onReorder = useCallback(
    (ids: string[]) => setSteps((prev) => stepsInIdOrder(prev, ids)),
    [setSteps]
  );
  const copyStep = useCallback(
    (id: string) => {
      copySteps([id]);
    },
    [copySteps]
  );
  const pasteHere = useCallback(() => {
    pasteSteps();
  }, [pasteSteps]);

  return (
    <TimelineBody
      chips={chips}
      slides={slides}
      currentImageIndex={state.currentImageIndex}
      selectedStepId={state.selectedStepId}
      addingStep={state.addingStep}
      setSelectedStepId={state.setSelectedStepId}
      setCurrentImageIndex={state.setCurrentImageIndex}
      setAddingStep={state.setAddingStep}
      onReorder={onReorder}
      onDuplicateStep={state.duplicateStep}
      onCopyStep={onCopyStep ?? copyStep}
      onPasteSteps={pasteHere}
      clipboardStepCount={state.clipboardStepCount}
    />
  );
};
