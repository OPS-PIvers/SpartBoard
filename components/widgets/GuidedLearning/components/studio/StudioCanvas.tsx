import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Circle,
  EyeOff,
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
import { InlineCalloutEditor } from './InlineCalloutEditor';
import { BlurTool } from './BlurTool';
import { useApplyRedaction } from './useApplyRedaction';
import { viewTransform } from './useCanvasViewport';
import type { CanvasTools } from './useCanvasTools';
import type { DevicePreset, StageGeometry, StageStep } from '../../types/stage';
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
    linkPending,
    onGeometry,
    canBlur,
    blurActive,
    toggleBlur,
    exitBlur,
    blurMode,
    setBlurMode,
    blurRects,
    setBlurRects,
  } = tools;
  const redaction = useApplyRedaction(state);

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
    !blurActive && selectedStep && selectedStep.imageIndex === currentImageIndex
      ? selectedStep.id
      : null;
  const zoomScale =
    shownStepId &&
    (selectedStep?.interactionType === 'pan-zoom' ||
      selectedStep?.interactionType === 'pan-zoom-spotlight')
      ? (selectedStep.panZoomScale ?? 2.5)
      : 1;

  const renderEditLayer = useCallback(
    (g: StageGeometry) =>
      blurActive ? (
        <BlurTool
          g={g}
          rects={blurRects}
          mode={blurMode}
          onChange={setBlurRects}
        />
      ) : (
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
          editing={editingStepId !== null}
          beginGesture={beginGesture}
          endGesture={endGesture}
        />
      ),
    [
      blurActive,
      blurRects,
      blurMode,
      setBlurRects,
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
      editingStepId,
      beginGesture,
      endGesture,
    ]
  );

  const renderCalloutEditor = useCallback(
    (shown: StageStep) => {
      const step = steps.find((s) => s.id === shown.id);
      return step ? (
        <InlineCalloutEditor
          step={step}
          onChange={updateStep}
          onDone={() => setEditingStepId(null)}
          holdOpen={linkPending}
        />
      ) : null;
    },
    [steps, updateStep, setEditingStepId, linkPending]
  );

  const applyBlur = async () => {
    const done = await redaction.apply(currentImageIndex, blurRects, blurMode);
    if (done) exitBlur();
  };

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
            editingStepId={editingStepId}
            renderCalloutEditor={renderCalloutEditor}
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
          aria-pressed={!addingStep && !blurActive}
          aria-label={t('glStudio.toolSelect')}
          title={t('glStudio.toolSelect')}
          onClick={() => chooseTool(null)}
          className={toolClass(!addingStep && !blurActive)}
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
        <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />
        <button
          type="button"
          aria-pressed={blurActive}
          aria-label={t('glStudio.tool_blur')}
          title={canBlur ? t('glStudio.tool_blur') : t('glStudio.blurNoVideo')}
          onClick={toggleBlur}
          disabled={!canBlur}
          className={`${toolClass(blurActive)} disabled:opacity-40`}
        >
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {blurActive && (
        <div
          role="group"
          aria-label={t('glStudio.blurTitle')}
          data-testid="gl-blur-bar"
          className="absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-slate-200 bg-white/95 p-1 pl-3 text-xs shadow-md"
        >
          <span className="font-bold text-slate-700" aria-live="polite">
            {blurRects.length > 0
              ? t('glStudio.blurCount', { count: blurRects.length })
              : t('glStudio.blurHint')}
          </span>
          <div className="flex rounded-md bg-slate-100 p-0.5">
            {(['blur', 'solid'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={blurMode === m}
                onClick={() => setBlurMode(m)}
                className={`rounded px-2 py-1 font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
                  blurMode === m
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {t(`glStudio.blurMode_${m}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void applyBlur()}
            disabled={blurRects.length === 0 || redaction.applying}
            className="rounded-md bg-brand-blue-primary px-3 py-1.5 font-bold text-white hover:bg-brand-blue-dark disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-1"
          >
            {redaction.applying
              ? t('glStudio.blurApplying')
              : t('glStudio.blurApply')}
          </button>
          <button
            type="button"
            onClick={exitBlur}
            disabled={redaction.applying}
            className="rounded-md px-2 py-1.5 font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

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
