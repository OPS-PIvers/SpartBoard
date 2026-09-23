import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { GuidedLearningStep } from '@/types';
import { SortableList } from '@/components/common/SortableList';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';
import { reorderSlideSteps } from './timelineOrder';

const getStepId = (s: GuidedLearningStep) => s.id;

interface StudioTimelineProps {
  state: GuidedLearningEditorController;
}

/** Bottom strip: the current slide's steps in play order. */
export const StudioTimeline: React.FC<StudioTimelineProps> = ({ state }) => {
  const { t } = useTranslation();
  const {
    steps,
    currentImageSteps,
    currentImageIndex,
    selectedStepId,
    setSelectedStepId,
    reorderSteps,
    addingStep,
    setAddingStep,
    imageUrls,
  } = state;

  const numberById = useMemo(() => {
    const map = new Map<string, number>();
    steps.forEach((s, i) => map.set(s.id, i + 1));
    return map;
  }, [steps]);

  const onReorder = useCallback(
    (next: GuidedLearningStep[]) =>
      reorderSteps(reorderSlideSteps(steps, next)),
    [steps, reorderSteps]
  );

  if (imageUrls.length === 0) return null;

  return (
    <section
      aria-label={t('glStudio.timelineLabel', { n: currentImageIndex + 1 })}
      className="flex shrink-0 items-center gap-3 border-t border-slate-200 bg-white px-4 py-2.5"
    >
      <span className="shrink-0 text-xxs font-bold uppercase tracking-wider text-slate-500">
        {t('glStudio.slideN', { n: currentImageIndex + 1 })}
      </span>
      <div className="min-w-0 flex-1 overflow-x-auto custom-scrollbar">
        {currentImageSteps.length === 0 ? (
          <p className="text-xs text-slate-500">
            {t('glStudio.noStepsOnSlide')}
          </p>
        ) : (
          <SortableList
            items={currentImageSteps}
            getId={getStepId}
            onReorder={onReorder}
            layout="grid"
            className="flex gap-1.5"
            renderItem={(s, handle) => {
              const n = numberById.get(s.id) ?? 0;
              const selected = s.id === selectedStepId;
              const label = s.label?.trim();
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
};
