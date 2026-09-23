import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Circle,
  Hexagon,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  Square,
} from 'lucide-react';
import type { GuidedLearningPublicStep } from '@/types';
import { GuidedLearningStage } from '../GuidedLearningStage';
import { DeviceFrame } from './DeviceFrame';
import { draftSetForStage } from './draftSet';
import { StudioEditLayer, type DrawShape } from './StudioEditLayer';
import { viewTransform } from './useCanvasViewport';
import type { CanvasTools } from './useCanvasTools';
import type { DevicePreset, StageGeometry } from '../../types/stage';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';

const NO_ANSWERS: ReadonlySet<string> = new Set();
const noop = () => undefined;

interface StudioCanvasProps {
  state: GuidedLearningEditorController;
  tools: CanvasTools;
  setId: string;
  preset: DevicePreset;
}

const TOOL_ICONS: Record<DrawShape, typeof Square> = {
  rect: Square,
  ellipse: Circle,
  polygon: Hexagon,
};

/** The Studio canvas: the real stage at the preset's true size, with the edit layer on top. */
export const StudioCanvas: React.FC<StudioCanvasProps> = ({
  state,
  tools,
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
    updateStep,
    beginGesture,
    endGesture,
  } = state;
  const {
    viewport,
    shape,
    chooseTool,
    polygonDraft,
    setPolygonDraft,
    closePolygon,
    setCalloutFocused,
    editingStepId,
    setEditingStepId,
    onGeometry,
  } = tools;

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
    (g: StageGeometry) => (
      <StudioEditLayer
        g={g}
        zoom={viewport.view.zoom}
        steps={steps}
        imageIndex={currentImageIndex}
        selectedStepId={shownStepId}
        adding={addingStep}
        shape={shape}
        polygonDraft={polygonDraft}
        onPolygonDraft={setPolygonDraft}
        onClosePolygon={closePolygon}
        onSelect={setSelectedStepId}
        onChange={updateStep}
        onAdd={(at, region) => addStepAt(at.xPct, at.yPct, region)}
        onCalloutFocus={setCalloutFocused}
        onEditCallout={setEditingStepId}
        beginGesture={beginGesture}
        endGesture={endGesture}
      />
    ),
    [
      viewport.view.zoom,
      steps,
      currentImageIndex,
      shownStepId,
      addingStep,
      shape,
      polygonDraft,
      setPolygonDraft,
      closePolygon,
      setSelectedStepId,
      updateStep,
      addStepAt,
      setCalloutFocused,
      setEditingStepId,
      beginGesture,
      endGesture,
    ]
  );

  if (imageUrls.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        {t('glStudio.emptyCanvas')}
      </div>
    );
  }

  const { view, attachRoot, panning, spaceHeld, panHandlers, fit, zoomBy } =
    viewport;
  const toolButton =
    'flex h-8 w-8 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';
  const toolClass = (active: boolean) =>
    `${toolButton} ${
      active
        ? 'bg-brand-blue-primary text-white'
        : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div
      ref={attachRoot}
      data-gl-studio-canvas=""
      data-editing-step={editingStepId ?? undefined}
      className={`relative h-full w-full overflow-hidden ${
        panning ? 'cursor-grabbing' : spaceHeld ? 'cursor-grab' : ''
      }`}
      {...panHandlers}
    >
      <div
        data-testid="gl-studio-viewport"
        className="h-full w-full"
        style={{ transform: viewTransform(view), transformOrigin: '0 0' }}
      >
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
            onGeometry={onGeometry}
            onPinClick={setSelectedStepId}
            onAdvance={noop}
            onDismiss={noop}
          />
        </DeviceFrame>
      </div>

      <div
        role="toolbar"
        aria-label={t('glStudio.canvasTools')}
        className="absolute left-2 top-2 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-md"
      >
        <button
          type="button"
          aria-pressed={!addingStep}
          aria-label={t('glStudio.toolSelect')}
          title={t('glStudio.toolSelect')}
          onClick={() => chooseTool(null)}
          className={toolClass(!addingStep)}
        >
          <MousePointer2 className="h-4 w-4" aria-hidden="true" />
        </button>
        {(['rect', 'ellipse', 'polygon'] as const).map((s) => {
          const Icon = TOOL_ICONS[s];
          const label = t(`glStudio.tool_${s}`);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={addingStep && shape === s}
              aria-label={label}
              title={label}
              onClick={() => chooseTool(s)}
              className={toolClass(addingStep && shape === s)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {addingStep && (
        <p className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-slate-900/90 px-3 py-1 text-xs font-bold text-white shadow">
          {shape === 'polygon'
            ? t('glStudio.polygonHint')
            : t('glStudio.drawHint')}
        </p>
      )}

      <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-md">
        <button
          type="button"
          aria-label={t('glStudio.zoomOut')}
          title={t('glStudio.zoomOut')}
          onClick={() => zoomBy(1 / 1.25)}
          disabled={view.zoom <= 1}
          className={`${toolButton} text-slate-600 hover:bg-slate-100 disabled:opacity-40`}
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <span
          data-testid="gl-studio-zoom"
          className="w-12 text-center text-xs font-bold tabular-nums text-slate-600"
        >
          {Math.round(view.zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label={t('glStudio.zoomIn')}
          title={t('glStudio.zoomIn')}
          onClick={() => zoomBy(1.25)}
          disabled={view.zoom >= 4}
          className={`${toolButton} text-slate-600 hover:bg-slate-100 disabled:opacity-40`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t('glStudio.zoomFit')}
          title={t('glStudio.zoomFit')}
          onClick={fit}
          className={`${toolButton} text-slate-600 hover:bg-slate-100`}
        >
          <Maximize className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
