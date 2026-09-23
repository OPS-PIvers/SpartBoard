import React, { useCallback, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowLeftRight, Sparkles } from 'lucide-react';
import { GuidedLearningStepEditor } from '../GuidedLearningStepEditor';
import { StudioRegionControls } from './StudioRegionControls';
import { StudioNarration, StudioNarrationBatch } from './StudioNarration';
import { SettingChip } from '../editorShared/SettingChip';
import { WelcomeChip } from '../editorShared/WelcomeChip';
import { VideoTrimBar } from '../editorShared/VideoTrimBar';
import {
  MODE_OPTIONS,
  PULSE_OPTIONS,
  TRANSITION_OPTIONS,
} from '../editorShared/setOptions';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';

interface StudioPropertiesPanelProps {
  state: GuidedLearningEditorController;
  /** The canvas element, used to find the stage's video for trimming. */
  canvasRef: React.RefObject<HTMLElement | null>;
  /** Recorder-drafted step text, flagged until the author edits it. */
  aiDrafts?: ReadonlyMap<string, { label: string; text: string }>;
}

const findStageVideo = (canvas: HTMLElement | null) =>
  canvas?.querySelector('video') ?? null;

// Follows the stage's <video> for the current slide so the trim bar can scrub it.
function useStageVideo(
  canvasRef: React.RefObject<HTMLElement | null>,
  slideKey: string
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const el = findStageVideo(canvasRef.current);
      videoRef.current = el;
      if (!el || !slideKey) return () => undefined;
      el.addEventListener('loadedmetadata', onChange);
      el.addEventListener('durationchange', onChange);
      return () => {
        el.removeEventListener('loadedmetadata', onChange);
        el.removeEventListener('durationchange', onChange);
      };
    },
    [canvasRef, slideKey]
  );
  const duration = useSyncExternalStore(subscribe, () => {
    const d = findStageVideo(canvasRef.current)?.duration;
    return d !== undefined && Number.isFinite(d) ? d : null;
  });
  return { videoRef, duration };
}

/** Right column: the selected step's editor, or the set's settings when nothing is selected. */
export const StudioPropertiesPanel: React.FC<StudioPropertiesPanelProps> = ({
  state,
  canvasRef,
  aiDrafts,
}) => {
  const { t } = useTranslation();
  const {
    selectedStep,
    steps,
    imageUrls,
    imageKinds,
    videoTrims,
    setVideoTrim,
    currentImageIndex,
    updateStep,
    deleteStep,
    description,
    setDescription,
    mode,
    setMode,
    hotspotPulse,
    setHotspotPulse,
    imageTransition,
    setImageTransition,
    welcomeEnabled,
    setWelcomeEnabled,
    welcomeMessage,
    setWelcomeMessage,
  } = state;

  const isVideoSlide = imageKinds[currentImageIndex] === 'video';
  const { videoRef, duration } = useStageVideo(
    canvasRef,
    isVideoSlide ? (imageUrls[currentImageIndex] ?? '') : ''
  );

  if (selectedStep) {
    const stepNumber = steps.findIndex((s) => s.id === selectedStep.id) + 1;
    const draft = aiDrafts?.get(selectedStep.id);
    const isDraft =
      !!draft &&
      (selectedStep.label ?? '') === draft.label &&
      (selectedStep.text ?? '') === draft.text;
    return (
      <>
        {isDraft && (
          <p className="mx-4 mt-4 flex w-fit items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('glRecorder.aiDraft')}
          </p>
        )}
        <StudioRegionControls step={selectedStep} onChange={updateStep} />
        <StudioNarration
          key={`narration-${selectedStep.id}`}
          state={state}
          step={selectedStep}
        />
        <GuidedLearningStepEditor
          key={selectedStep.id}
          step={selectedStep}
          stepNumber={stepNumber}
          imageCount={imageUrls.length}
          onChange={updateStep}
          onDelete={() => deleteStep(selectedStep.id)}
        />
      </>
    );
  }

  return (
    <div
      className="flex flex-col gap-5 p-4"
      data-testid="gl-studio-set-settings"
    >
      <h2 className="text-xxs font-bold uppercase tracking-wider text-slate-500">
        {t('glStudio.activitySettings')}
      </h2>
      <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
        {t('glStudio.description')}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder={t('glStudio.descriptionPlaceholder')}
          className="resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
        />
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-bold text-slate-600">
          {t('glStudio.playMode')}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              aria-pressed={mode === opt.value}
              title={opt.desc}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                mode === opt.value
                  ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-slate-600">
          {t('glStudio.display')}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <SettingChip
            label="Pulse"
            icon={Activity}
            value={hotspotPulse}
            options={PULSE_OPTIONS}
            onChange={setHotspotPulse}
          />
          <SettingChip
            label="Transition"
            icon={ArrowLeftRight}
            value={imageTransition}
            options={TRANSITION_OPTIONS}
            onChange={setImageTransition}
          />
          <WelcomeChip
            enabled={welcomeEnabled}
            message={welcomeMessage}
            onEnabledChange={setWelcomeEnabled}
            onMessageChange={setWelcomeMessage}
          />
        </div>
      </div>
      {steps.length > 0 && <StudioNarrationBatch state={state} />}
      {isVideoSlide && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-slate-600">
            {t('glStudio.videoSlide', { n: currentImageIndex + 1 })}
          </span>
          <VideoTrimBar
            videoRef={videoRef}
            duration={duration}
            trim={videoTrims[currentImageIndex] ?? null}
            onChange={(trim) => setVideoTrim(currentImageIndex, trim)}
          />
        </div>
      )}
      {imageUrls.length > 0 && (
        <p className="text-xs text-slate-500">{t('glStudio.selectStepHint')}</p>
      )}
    </div>
  );
};
