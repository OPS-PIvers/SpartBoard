import React, { useCallback, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Film,
  Image as ImageIcon,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  GuidedLearningMode,
  GuidedLearningSet,
  GuidedLearningStep,
  GuidedLearningWatchPace,
} from '@/types';
import { StudioRegionControls } from './StudioRegionControls';
import { StudioTourControls } from './StudioTourControls';
import { StudioTourPublish } from './StudioTourPublish';
import { StudioTourSetup } from './StudioTourSetup';
import { StudioNarration, StudioNarrationBatch } from './StudioNarration';
import { StudioStepFields, StudioStepPlayback } from './StudioStepFields';
import { VideoTrimBar } from '../editorShared/VideoTrimBar';
import {
  ChoiceGroup,
  Field,
  groupHeadingClass,
  hintClass,
  inputClass,
} from './panelControls';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';
import { markReviewed } from './aiDraftReview';

interface StudioPropertiesPanelProps {
  state: GuidedLearningEditorController;
  /** Deletes a step; the Studio passes one that offers Undo. */
  onDeleteStep?: (id: string) => void;
  /** The canvas element, used to find the stage's video for trimming. */
  canvasRef: React.RefObject<HTMLElement | null>;
  /** Shows each step's live-tour link; building sets with live tours only. */
  liveTours?: boolean;
  /** The set as a save would write it now, for the tour's publish status. */
  tourSet?: GuidedLearningSet;
  /** Runs the saved draft live from this step. */
  onRunFromStep?: (stepId: string) => void;
  /** Captures one new click for this step. */
  onRerecordStep?: (stepId: string) => void;
  /** Fades the Studio while Find on board flashes a button. */
  onPeekBoard?: (peeking: boolean) => void;
}

interface TourTools {
  onRunFromStep?: (stepId: string) => void;
  onRerecordStep?: (stepId: string) => void;
  onPeekBoard?: (peeking: boolean) => void;
}

const MODES: readonly GuidedLearningMode[] = [
  'structured',
  'guided',
  'explore',
];
const PULSES = ['consistent', 'reminder', 'off'] as const;
const TRANSITIONS = ['none', 'slide', 'fade'] as const;
const PACES: readonly GuidedLearningWatchPace[] = ['standard', 'calm'];

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

const Group: React.FC<{
  title: string;
  testId?: string;
  children: React.ReactNode;
}> = ({ title, testId, children }) => (
  <div className="flex flex-col gap-4" data-testid={testId}>
    <h3 className={groupHeadingClass}>{title}</h3>
    {children}
  </div>
);

/** Right column: the selected step and its slide, or the activity's settings and the current slide. */
export const StudioPropertiesPanel: React.FC<StudioPropertiesPanelProps> = ({
  state,
  onDeleteStep,
  canvasRef,
  liveTours = false,
  tourSet,
  onRunFromStep,
  onRerecordStep,
  onPeekBoard,
}) => {
  const { selectedStep } = state;
  const tools: TourTools = { onRunFromStep, onRerecordStep, onPeekBoard };
  return (
    <div className="flex flex-col divide-y divide-slate-200">
      {selectedStep ? (
        <StepSection
          key={selectedStep.id}
          state={state}
          step={selectedStep}
          onDeleteStep={onDeleteStep}
          liveTours={liveTours}
          tools={tools}
        />
      ) : (
        <ActivitySection
          state={state}
          liveTours={liveTours}
          tourSet={tourSet}
        />
      )}
      {state.imageUrls.length > 0 && (
        <SlideSection state={state} canvasRef={canvasRef} />
      )}
    </div>
  );
};

const StepSection: React.FC<{
  state: GuidedLearningEditorController;
  step: GuidedLearningStep;
  onDeleteStep?: (id: string) => void;
  liveTours: boolean;
  tools: TourTools;
}> = ({ state, step, onDeleteStep, liveTours, tools }) => {
  const { t } = useTranslation();
  const { steps, imageUrls, updateStep, deleteStep } = state;
  const n = steps.findIndex((s) => s.id === step.id) + 1;
  return (
    <section
      aria-labelledby="gl-studio-step-heading"
      data-testid="gl-studio-step-section"
      className="flex flex-col gap-6 p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="gl-studio-step-heading"
            className="text-lg font-bold text-slate-900"
          >
            {t('glStudio.stepN', { n })}
          </h2>
          <p className="truncate text-xs text-slate-600">
            {t(`glStudio.interaction_${step.interactionType}`)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => (onDeleteStep ?? deleteStep)(step.id)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t('glStudio.deleteStep')}
        </button>
      </header>
      {step.aiDraft && (
        <div className="-mt-3 flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('glRecorder.aiDraft')}
          </p>
          <button
            type="button"
            onClick={() => updateStep(markReviewed(step))}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {t('glStudio.markReviewed')}
          </button>
        </div>
      )}
      <StudioStepFields
        step={step}
        slideCount={imageUrls.length}
        onChange={updateStep}
      />
      <Group title={t('glStudio.targetGroup')}>
        <StudioRegionControls step={step} onChange={updateStep} />
      </Group>
      <Group title={t('glStudio.playbackGroup')}>
        <StudioStepPlayback step={step} onChange={updateStep} />
      </Group>
      <StudioNarration state={state} step={step} />
      {liveTours && (
        <StudioTourControls
          step={step}
          onChange={(next) => updateStep(next, false)}
          setupWidgets={state.tourSetupWidgets}
          onPeekBoard={tools.onPeekBoard}
          onRunFromStep={
            tools.onRunFromStep
              ? () => tools.onRunFromStep?.(step.id)
              : undefined
          }
          onRerecord={
            tools.onRerecordStep
              ? () => tools.onRerecordStep?.(step.id)
              : undefined
          }
        />
      )}
    </section>
  );
};

const ActivitySection: React.FC<{
  state: GuidedLearningEditorController;
  liveTours: boolean;
  tourSet?: GuidedLearningSet;
}> = ({ state, liveTours, tourSet }) => {
  const { t } = useTranslation();
  const {
    steps,
    imageUrls,
    description,
    setDescription,
    mode,
    setMode,
    watchPace,
    setWatchPace,
    welcomeEnabled,
    setWelcomeEnabled,
    welcomeMessage,
    setWelcomeMessage,
  } = state;
  return (
    <section
      aria-labelledby="gl-studio-activity-heading"
      className="flex flex-col gap-6 p-4"
      data-testid="gl-studio-set-settings"
    >
      <h2
        id="gl-studio-activity-heading"
        className="text-lg font-bold text-slate-900"
      >
        {t('glStudio.activitySettings')}
      </h2>
      <Field label={t('glStudio.description')}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder={t('glStudio.descriptionPlaceholder')}
          className={`${inputClass} resize-none`}
        />
      </Field>
      <ChoiceGroup
        legend={t('glStudio.playMode')}
        value={mode}
        options={MODES.map((value) => ({
          value,
          label: t(`glStudio.mode_${value}`),
          desc: t(`glStudio.modeDesc_${value}`),
        }))}
        onChange={setMode}
      />
      {mode === 'guided' && (
        <ChoiceGroup
          legend={t('glStudio.watchPace')}
          value={watchPace ?? 'standard'}
          options={PACES.map((value) => ({
            value,
            label: t(`glStudio.pace_${value}`),
            desc: t(`glStudio.paceDesc_${value}`),
          }))}
          onChange={(next) =>
            setWatchPace(next === 'standard' ? undefined : next)
          }
          testId="gl-studio-watch-pace"
        />
      )}
      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={welcomeEnabled}
            onChange={(e) => setWelcomeEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-blue-primary"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-xs font-bold">
              {t('glStudio.welcomeToggle')}
            </span>
            <span className={hintClass}>{t('glStudio.welcomeHint')}</span>
          </span>
        </label>
        {welcomeEnabled && (
          <Field label={t('glStudio.welcomeMessage')}>
            <textarea
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              rows={3}
              placeholder={t('glStudio.welcomePlaceholder')}
              className={`${inputClass} resize-none`}
            />
          </Field>
        )}
      </div>
      {steps.length > 0 && <StudioNarrationBatch state={state} />}
      {liveTours && (
        <Group title={t('glStudio.tourTitle')} testId="gl-studio-set-tour">
          {tourSet && steps.some((s) => !!s.tour) && (
            <StudioTourPublish set={tourSet} />
          )}
          <StudioTourSetup
            widgets={state.tourSetupWidgets}
            onChange={state.setTourSetupWidgets}
          />
        </Group>
      )}
      {imageUrls.length > 0 && (
        <p className={hintClass}>{t('glStudio.selectStepHint')}</p>
      )}
    </section>
  );
};

const SlideSection: React.FC<{
  state: GuidedLearningEditorController;
  canvasRef: React.RefObject<HTMLElement | null>;
}> = ({ state, canvasRef }) => {
  const { t } = useTranslation();
  const {
    imageUrls,
    imageKinds,
    videoTrims,
    setVideoTrim,
    currentImageIndex,
    hotspotPulse,
    setHotspotPulse,
    imageTransition,
    setImageTransition,
  } = state;
  const kind = imageKinds[currentImageIndex] ?? 'image';
  const isVideo = kind === 'video';
  const { videoRef, duration } = useStageVideo(
    canvasRef,
    isVideo ? (imageUrls[currentImageIndex] ?? '') : ''
  );
  const KindIcon = isVideo ? Film : ImageIcon;
  return (
    <section
      aria-labelledby="gl-studio-slide-heading"
      data-testid="gl-studio-slide-section"
      className="flex flex-col gap-6 p-4"
    >
      <div>
        <h2
          id="gl-studio-slide-heading"
          className="text-lg font-bold text-slate-900"
        >
          {t('glStudio.slideN', { n: currentImageIndex + 1 })}
        </h2>
        <p className="flex items-center gap-1 text-xs text-slate-600">
          <KindIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {t(`glStudio.slideKind_${kind}`)}
        </p>
      </div>
      {isVideo && (
        <VideoTrimBar
          videoRef={videoRef}
          duration={duration}
          trim={videoTrims[currentImageIndex] ?? null}
          onChange={(trim) => setVideoTrim(currentImageIndex, trim)}
        />
      )}
      <Group title={t('glStudio.allSlides')}>
        <ChoiceGroup
          legend={t('glStudio.pulse')}
          value={hotspotPulse}
          options={PULSES.map((value) => ({
            value,
            label: t(`glStudio.pulse_${value}`),
            desc: t(`glStudio.pulseDesc_${value}`),
          }))}
          onChange={setHotspotPulse}
          testId="gl-studio-pulse"
        />
        <ChoiceGroup
          legend={t('glStudio.transition')}
          value={imageTransition}
          options={TRANSITIONS.map((value) => ({
            value,
            label: t(`glStudio.transition_${value}`),
            desc: t(`glStudio.transitionDesc_${value}`),
          }))}
          onChange={setImageTransition}
          testId="gl-studio-transition"
        />
      </Group>
    </section>
  );
};
