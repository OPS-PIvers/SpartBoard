import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { GuidedLearningPublicStep } from '@/types';
import { GuidedLearningStage } from '../GuidedLearningStage';
import { DeviceFrame } from './DeviceFrame';
import { regionRect } from '../../utils/regionGeometry';
import { draftSetForStage } from './draftSet';
import type { DevicePreset, StageGeometry } from '../../types/stage';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';

const NO_ANSWERS: ReadonlySet<string> = new Set();
const noop = () => undefined;

interface StudioCanvasProps {
  state: GuidedLearningEditorController;
  setId: string;
  preset: DevicePreset;
}

/** The Studio canvas: the real stage at the preset's true size, plus a selection outline. */
export const StudioCanvas: React.FC<StudioCanvasProps> = ({
  state,
  setId,
  preset,
}) => {
  const { t } = useTranslation();
  const {
    title,
    imageUrls,
    imageKinds,
    videoTrims,
    steps,
    mode,
    hotspotPulse,
    imageTransition,
    watchPace,
    spotlightRadiiV2,
    currentImageIndex,
    selectedStepId,
    setSelectedStepId,
    addingStep,
    addStepAt,
  } = state;

  const set = useMemo(
    () =>
      draftSetForStage(
        {
          title,
          imageUrls,
          imageKinds,
          videoTrims,
          steps,
          mode,
          hotspotPulse,
          imageTransition,
          watchPace,
          spotlightRadiiV2,
        },
        setId
      ),
    [
      title,
      imageUrls,
      imageKinds,
      videoTrims,
      steps,
      mode,
      hotspotPulse,
      imageTransition,
      watchPace,
      spotlightRadiiV2,
      setId,
    ]
  );

  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null;
  const shownStepId =
    selectedStep && selectedStep.imageIndex === currentImageIndex
      ? selectedStep.id
      : null;
  const zoomScale =
    shownStepId &&
    (selectedStep?.interactionType === 'pan-zoom' ||
      selectedStep?.interactionType === 'pan-zoom-spotlight')
      ? (selectedStep.panZoomScale ?? 2.5)
      : 1;

  const renderEditLayer = useCallback(
    (g: StageGeometry) => {
      const outline =
        selectedStep && shownStepId
          ? regionRect(g.regionFor(selectedStep))
          : null;
      return (
        <>
          {outline && (
            <div
              data-testid="gl-studio-selection"
              className="absolute rounded-sm outline outline-2 outline-offset-2 outline-sky-400"
              style={{
                left: outline.x,
                top: outline.y,
                width: outline.w,
                height: outline.h,
              }}
            />
          )}
          {addingStep && (
            <div
              data-testid="gl-studio-add-surface"
              className="pointer-events-auto absolute inset-0 cursor-crosshair"
              onClick={(e) => {
                const p = g.clientToImagePct(e.clientX, e.clientY);
                if (p.xPct < 0 || p.xPct > 100 || p.yPct < 0 || p.yPct > 100)
                  return;
                addStepAt(p.xPct, p.yPct);
              }}
            />
          )}
        </>
      );
    },
    [selectedStep, shownStepId, addingStep, addStepAt]
  );

  if (imageUrls.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        {t('glStudio.emptyCanvas')}
      </div>
    );
  }

  return (
    <DeviceFrame preset={preset}>
      <GuidedLearningStage
        set={set}
        steps={steps as unknown as GuidedLearningPublicStep[]}
        imageIndex={currentImageIndex}
        activeStepId={shownStepId}
        authorMode="explore"
        answeredStepIds={NO_ANSWERS}
        teacherMode
        zoomScale={zoomScale}
        forceOverlay
        renderEditLayer={renderEditLayer}
        onPinClick={setSelectedStepId}
        onAdvance={noop}
        onDismiss={noop}
      />
    </DeviceFrame>
  );
};
