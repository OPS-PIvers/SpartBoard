import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { SortableList } from '@/components/common/SortableList';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';
import { reorderSlideSteps } from './timelineOrder';

interface StepChip {
  id: string;
  n: number;
  label: string;
}

const getChipId = (c: StepChip) => c.id;

const sameChips = (a: StepChip[], b: StepChip[]) =>
  a.length === b.length &&
  a.every(
    (c, i) => c.id === b[i].id && c.n === b[i].n && c.label === b[i].label
  );

interface TimelineBodyProps {
  chips: StepChip[];
  hasSlides: boolean;
  currentImageIndex: number;
  selectedStepId: string | null;
  addingStep: boolean;
  setSelectedStepId: GuidedLearningEditorController['setSelectedStepId'];
  setAddingStep: GuidedLearningEditorController['setAddingStep'];
  onReorder: (ids: string[]) => void;
}

const sameBodyProps = (a: TimelineBodyProps, b: TimelineBodyProps) =>
  (Object.keys(a) as (keyof TimelineBodyProps)[]).every((k) =>
    k === 'chips' ? sameChips(a.chips, b.chips) : Object.is(a[k], b[k])
  );

// Typing in a step changes no chip, so the strip skips those renders.
const TimelineBody = React.memo(function TimelineBody({
  chips,
  hasSlides,
  currentImageIndex,
  selectedStepId,
  addingStep,
  setSelectedStepId,
  setAddingStep,
  onReorder,
}: TimelineBodyProps) {
  const { t } = useTranslation();

  if (!hasSlides) return null;

  return (
    <section
      aria-label={t('glStudio.timelineLabel', { n: currentImageIndex + 1 })}
      className="flex shrink-0 items-center gap-3 border-t border-slate-200 bg-white px-4 py-2.5"
    >
      <span className="shrink-0 text-xxs font-bold uppercase tracking-wider text-slate-500">
        {t('glStudio.slideN', { n: currentImageIndex + 1 })}
      </span>
      <div className="min-w-0 flex-1 overflow-x-auto custom-scrollbar">
        {chips.length === 0 ? (
          <p className="text-xs text-slate-500">
            {t('glStudio.noStepsOnSlide')}
          </p>
        ) : (
          <SortableList
            items={chips}
            getId={getChipId}
            onReorder={(next) => onReorder(next.map((c) => c.id))}
            layout="grid"
            className="flex gap-1.5"
            renderItem={(s, handle) => {
              const { n, label } = s;
              const selected = s.id === selectedStepId;
              return (
                <button
                  type="button"
                  {...handle.attributes}
                  onPointerDown={
                    handle.listeners?.onPointerDown as
                      | React.PointerEventHandler<HTMLButtonElement>
                      | undefined
                  }
                  onClick={() => setSelectedStepId(s.id)}
                  aria-pressed={selected}
                  aria-label={
                    label
                      ? t('glStudio.stepNLabelled', { n, label })
                      : t('glStudio.stepN', { n })
                  }
                  className={`flex max-w-[180px] shrink-0 cursor-grab touch-none items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-bold transition-colors active:cursor-grabbing ${
                    selected
                      ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                  }`}
                >
                  <span className="font-mono">{n}</span>
                  {label && (
                    <span className="truncate font-medium">{label}</span>
                  )}
                </button>
              );
            }}
          />
        )}
      </div>
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
}

/** Bottom strip: the current slide's steps in play order. */
export const StudioTimeline: React.FC<StudioTimelineProps> = ({ state }) => {
  const { steps, currentImageSteps, setSteps } = state;

  const chips = useMemo(() => {
    const numberById = new Map<string, number>();
    steps.forEach((s, i) => numberById.set(s.id, i + 1));
    return currentImageSteps.map((s) => ({
      id: s.id,
      n: numberById.get(s.id) ?? 0,
      label: s.label?.trim() ?? '',
    }));
  }, [steps, currentImageSteps]);

  // Works on the latest steps, so the memoized body can hold an older callback.
  const onReorder = useCallback(
    (ids: string[]) =>
      setSteps((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s]));
        return reorderSlideSteps(
          prev,
          ids.flatMap((id) => byId.get(id) ?? [])
        );
      }),
    [setSteps]
  );

  return (
    <TimelineBody
      chips={chips}
      hasSlides={state.imageUrls.length > 0}
      currentImageIndex={state.currentImageIndex}
      selectedStepId={state.selectedStepId}
      addingStep={state.addingStep}
      setSelectedStepId={state.setSelectedStepId}
      setAddingStep={state.setAddingStep}
      onReorder={onReorder}
    />
  );
};
