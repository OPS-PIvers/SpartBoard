import React, {
  useState,
  useEffect,
  useEffectEvent,
  useRef,
  useCallback,
} from 'react';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  X,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  GuidedLearningSet,
  GuidedLearningPublicStep,
  GuidedLearningMode,
  StudentOverride,
} from '@/types';
import { isGuidedLearningSetV2 } from '../utils/setMigration';
import { stepDurationMs } from '../utils/motion';
import {
  GuidedLearningStage,
  type StageCursorCue,
} from './GuidedLearningStage';
import { SpeedControl } from './player/SpeedControl';
import { useLearnerSpeed } from './player/useLearnerSpeed';
import { PlaybackModeToggle } from './player/PlaybackModeToggle';
import { WatchScrubber } from './player/WatchScrubber';
import { TRY_HINT_MS, defaultPlayback, hasStepTarget } from './player/playback';
import { StepOutline } from './player/StepOutline';
import { ResumePrompt } from './player/ResumePrompt';
import { useResumeOffer, writeResume } from './player/useResume';
import { speechAvailable, useReadAloud } from './player/useReadAloud';
import { spokenStepText } from '../utils/stepText';
import type { PctPoint, PlaybackMode, StepEvent } from '../types/stage';

const nowMs = (): number => performance.now();

/** Per-visit state of the current step; replaced whenever the step changes. */
interface StepRun {
  idx: number;
  seq: number;
  prevIdx: number | null;
  cursorDone: boolean;
  misclicks: number;
  hinted: boolean;
  lastMiss: PctPoint | null;
}

interface Props {
  set: GuidedLearningSet;
  onClose?: () => void;
  /** Called when a question is answered (student mode) */
  onAnswer?: (
    stepId: string,
    answer: string | string[],
    isCorrect: boolean | null
  ) => void;
  /** Teacher mode: has access to correct answers */
  teacherMode?: boolean;
  /** Student's accommodation override (M17 C3-gl) — scales guided-mode auto-advance. */
  timeMultiplier?: StudentOverride['timeMultiplier'];
  /** Player v2 (`gl-player-v2`): calm motion, learner speed, reading-time pacing. */
  playerV2?: boolean;
  /** Step enter/leave/misclick/hint/complete, for progress and analytics. */
  onStepEvent?: (e: StepEvent) => void;
  /** Open at this step instead of the first (the Studio's Play from here). */
  startStepId?: string;
}

export const GuidedLearningPlayer: React.FC<Props> = ({
  set,
  onClose,
  onAnswer,
  teacherMode = false,
  timeMultiplier,
  playerV2 = false,
  onStepEvent,
  startStepId,
}) => {
  const { t } = useTranslation();
  const mode: GuidedLearningMode = set.mode;
  // In teacher mode set.steps is GuidedLearningStep[]; in student mode it is
  // GuidedLearningPublicStep[] (via the student-app cast). We intentionally
  // narrow to GuidedLearningPublicStep[] here so interaction components never
  // accidentally read answer-key fields from steps. Answer keys are accessed
  // through set.steps.find() only when teacherMode is true (see GuidedLearningStage).
  const steps = set.steps as unknown as GuidedLearningPublicStep[];
  const startIdx = Math.max(
    0,
    steps.findIndex((s) => s.id === startStepId)
  );
  const [currentIdx, setCurrentIdx] = useState(startIdx);
  const [activeStepId, setActiveStepId] = useState<string | null>(
    mode !== 'explore' || startStepId ? (steps[startIdx]?.id ?? null) : null
  );
  const [exploreImageIndex, setExploreImageIndex] = useState(
    steps[startIdx]?.imageIndex ?? 0
  );
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1 for guided auto-advance
  const [answeredSteps, setAnsweredSteps] = useState<Set<string>>(new Set());
  // Ref kept in sync with the latest `answeredSteps` value on every render.
  // The setInterval callback in startTimer closes over this ref rather than
  // `answeredSteps` directly — if it captured the state value, every call to
  // `setAnsweredSteps` would cause `startTimer` to be recreated (answeredSteps
  // is in its deps), which would restart the timer (resetting progress to 0)
  // each time the student answered a question in guided mode.
  const answeredStepsRef = useRef(answeredSteps);
  // Keep the ref in sync directly in the render body (not a useEffect) so the
  // setInterval callback in startTimer always reads the latest value
  // synchronously — without needing answeredSteps in startTimer's dependency
  // array (which would restart the timer on every answer). A post-paint effect
  // would leave the callback reading a stale set until the effect commits.
  // CLAUDE.md-endorsed render-body ref sync; react-hooks/refs v7 false-positives
  // here because this component also adjusts state during render (the prevMode
  // latch below).
  // eslint-disable-next-line react-hooks/refs
  answeredStepsRef.current = answeredSteps;

  // Learner's Watch/Try choice (v2); the author's mode picks the default.
  const [playback, setPlayback] = useState<PlaybackMode>(() =>
    defaultPlayback(mode)
  );

  // Track previous mode to reset step index when mode changes (adjusting state while rendering)
  const [prevMode, setPrevMode] = useState(mode);
  if (prevMode !== mode) {
    setPrevMode(mode);
    setPlayback(defaultPlayback(mode));
    if (mode !== 'explore' && steps.length > 0) {
      setCurrentIdx(0);
      setActiveStepId(steps[0].id);
    } else if (mode === 'explore') {
      setActiveStepId(null);
      setExploreImageIndex(0);
    }
  }

  // Keyboard scope: the canvas wrapper around the stage.
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);
  const [speed, setSpeed] = useLearnerSpeed();

  const schemaV2 = isGuidedLearningSetV2(set);

  const currentStep = steps[currentIdx] ?? null;
  const stepDuration = currentStep
    ? stepDurationMs(currentStep, {
        timeMultiplier,
        playerV2,
        speed,
        watchPace: set.watchPace,
      })
    : 0;
  // Read by the running interval so a speed change keeps the step's progress.
  const stepDurationRef = useRef(stepDuration);
  // eslint-disable-next-line react-hooks/refs
  stepDurationRef.current = stepDuration;
  const activeStep = steps.find((s) => s.id === activeStepId) ?? null;

  const v2Playback = playerV2 && mode !== 'explore';
  // Saved place from an earlier visit on this device (sets and sessions alike key on set.id).
  const [resumeOffer, dismissResume] = useResumeOffer(
    set.id,
    steps.length,
    v2Playback
  );
  const [readAloud, setReadAloud] = useState(false);
  const readAloudAvailable =
    v2Playback &&
    (speechAvailable() || steps.some((s) => Boolean(s.narration?.url)));
  const isWatch = v2Playback && playback === 'watch';
  const isTry = v2Playback && playback === 'try';
  const autoAdvance = v2Playback ? isWatch : mode === 'guided';

  const [run, setRun] = useState<StepRun>({
    idx: currentIdx,
    seq: 0,
    prevIdx: null,
    cursorDone: false,
    misclicks: 0,
    hinted: false,
    lastMiss: null,
  });
  let stepRun = run;
  if (run.idx !== currentIdx) {
    stepRun = {
      idx: currentIdx,
      seq: run.seq + 1,
      prevIdx: run.idx,
      cursorDone: false,
      misclicks: 0,
      hinted: false,
      lastMiss: null,
    };
    setRun(stepRun);
  }
  const currentTargeted = hasStepTarget(currentStep);
  const cursorAllowed = currentTargeted && !currentStep?.cursor?.hide;
  const prevStep =
    stepRun.prevIdx !== null ? (steps[stepRun.prevIdx] ?? null) : null;
  const prevOnSameImage =
    prevStep !== null &&
    currentStep !== null &&
    (prevStep.imageIndex ?? 0) === (currentStep.imageIndex ?? 0);
  // Watch: the cursor glides to the target before the step's zoom and callout.
  const watchGlide = isWatch && cursorAllowed && !stepRun.cursorDone;
  const cameraStep = watchGlide && prevOnSameImage ? prevStep : currentStep;
  const markCursorDone = (seq: number) =>
    setRun((r) => (r.seq === seq ? { ...r, cursorDone: true } : r));
  const cursorCue: StageCursorCue | null =
    currentStep && watchGlide
      ? {
          key: `watch-${stepRun.seq}`,
          from:
            prevOnSameImage && prevStep && hasStepTarget(prevStep)
              ? { xPct: prevStep.xPct, yPct: prevStep.yPct }
              : null,
          to: { xPct: currentStep.xPct, yPct: currentStep.yPct },
          ripple: true,
          onDone: () => markCursorDone(stepRun.seq),
        }
      : currentStep && isTry && cursorAllowed && stepRun.hinted
        ? {
            key: `hint-${stepRun.seq}`,
            from: stepRun.lastMiss,
            to: { xPct: currentStep.xPct, yPct: currentStep.yPct },
            ripple: false,
          }
        : null;

  // Read-aloud starts once the step is shown (after a Watch glide).
  const voiceHeldRef = useRef(false);
  const handleVoiceDone = () => {
    if (!voiceHeldRef.current) return;
    voiceHeldRef.current = false;
    if (currentStep) emitRef.current('complete', currentStep.id);
    goNextRef.current();
  };
  const { speaking } = useReadAloud({
    enabled: readAloud && readAloudAvailable && !resumeOffer,
    step: currentStep,
    stepKey: currentStep && !watchGlide ? `${stepRun.seq}` : null,
    onDone: handleVoiceDone,
  });
  const speakingRef = useRef(speaking);
  // eslint-disable-next-line react-hooks/refs
  speakingRef.current = speaking;

  // Step events: ms counts from the step's enter.
  const enteredAtRef = useRef(0);
  const eventMode: PlaybackMode | null =
    mode === 'explore'
      ? null
      : v2Playback
        ? playback
        : mode === 'guided'
          ? 'watch'
          : 'try';
  const emitStepEvent = (
    type: StepEvent['type'],
    stepId: string,
    at?: PctPoint
  ) => {
    onStepEvent?.({
      stepId,
      type,
      mode: eventMode,
      ms: Math.max(0, Math.round(nowMs() - enteredAtRef.current)),
      ...(at ? { xPct: at.xPct, yPct: at.yPct } : {}),
    });
  };
  // Read by timers and effect cleanups that outlive this render.
  const emitRef = useRef(emitStepEvent);
  // eslint-disable-next-line react-hooks/refs
  emitRef.current = emitStepEvent;
  const eventStepId =
    mode === 'explore' ? activeStepId : (currentStep?.id ?? null);
  useEffect(() => {
    if (!eventStepId) return;
    enteredAtRef.current = nowMs();
    emitRef.current('enter', eventStepId);
    return () => emitRef.current('leave', eventStepId);
  }, [eventStepId]);

  // Try: the hint cursor shows the target after a quiet 5s.
  const hintArmed =
    isTry &&
    cursorAllowed &&
    !stepRun.hinted &&
    currentStep !== null &&
    !resumeOffer;
  const hintStepId = currentStep?.id;
  const hintSeq = stepRun.seq;
  useEffect(() => {
    if (!hintArmed || !hintStepId) return;
    const id = setTimeout(() => {
      setRun((r) => (r.seq === hintSeq ? { ...r, hinted: true } : r));
      emitRef.current('hint', hintStepId);
    }, TRY_HINT_MS);
    return () => clearTimeout(id);
  }, [hintArmed, hintStepId, hintSeq]);

  const rawCurrentImageIndex =
    mode === 'explore' ? exploreImageIndex : (currentStep?.imageIndex ?? 0);
  const currentImageIndex =
    set.imageUrls.length === 0
      ? 0
      : Math.min(
          Math.max(rawCurrentImageIndex, 0),
          Math.max(set.imageUrls.length - 1, 0)
        );

  // Derive pan-zoom active state from the camera's step (no effect needed)
  const panZoomTargetStep = mode === 'explore' ? activeStep : cameraStep;
  const panZoomActive =
    panZoomTargetStep?.interactionType === 'pan-zoom' ||
    panZoomTargetStep?.interactionType === 'pan-zoom-spotlight'
      ? panZoomTargetStep.id
      : null;

  // v2 zoom persistence — the held scale survives step changes until reset.
  const [zoomScale, setZoomScale] = useState(1);
  const [prevPanZoomId, setPrevPanZoomId] = useState<string | null>(null);
  if (schemaV2 && panZoomActive !== prevPanZoomId) {
    setPrevPanZoomId(panZoomActive);
    if (panZoomActive) {
      const zoomStep = steps.find((s) => s.id === panZoomActive);
      setZoomScale(zoomStep?.panZoomScale ?? 2.5);
    } else if (mode === 'explore') {
      // Explore deselect animates back to identity — clear the held zoom too.
      setZoomScale(1);
    }
  }

  // Steps the learner has moved past or completed, for the outline's marks.
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set());
  const markDone = useCallback((id: string) => {
    setDoneIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const goNext = useCallback(() => {
    if (steps.length === 0) return;
    // Already on the final step — nothing to advance to. Bail out instead of
    // resetting progress to 0, so a completed session's bar holds at 100%
    // rather than dropping back down (auto-advance timer, Continue button,
    // and ArrowRight can all reach this once the last step is done).
    const leaving = steps[currentIdx];
    if (leaving) markDone(leaving.id);
    if (currentIdx >= steps.length - 1) return;
    // New step starts with a fresh in-step timer/progress (dot-jump semantics).
    progressRef.current = 0;
    setProgress(0);
    setCurrentIdx((prev) => {
      const next = Math.min(prev + 1, steps.length - 1);
      setActiveStepId(steps[next]?.id ?? null);
      return next;
    });
  }, [steps, currentIdx, markDone]);

  const goNextRef = useRef(goNext);
  // eslint-disable-next-line react-hooks/refs
  goNextRef.current = goNext;

  const goPrev = useCallback(() => {
    if (steps.length === 0) return;
    progressRef.current = 0;
    setProgress(0);
    setCurrentIdx((prev) => {
      const prevIdx = Math.max(prev - 1, 0);
      setActiveStepId(steps[prevIdx]?.id ?? null);
      return prevIdx;
    });
  }, [steps]);

  const completeTryStep = (at: PctPoint) => {
    if (!currentStep) return;
    emitStepEvent('complete', currentStep.id, at);
    goNext();
  };

  const handleTargetClick = (hit: boolean, at: PctPoint) => {
    if (!currentStep) return;
    if (hit) {
      completeTryStep(at);
      return;
    }
    emitStepEvent('misclick', currentStep.id, at);
    const misclicks = stepRun.misclicks + 1;
    const hint = misclicks >= 2 && !stepRun.hinted && cursorAllowed;
    setRun((r) =>
      r.seq === stepRun.seq
        ? { ...r, misclicks, lastMiss: at, hinted: r.hinted || hint }
        : r
    );
    if (hint) emitStepEvent('hint', currentStep.id);
  };

  const choosePlayback = (next: PlaybackMode) => {
    if (next === playback) return;
    setPlayback(next);
    // Switching keeps the step on screen; the choice only changes what comes next.
    setRun((r) => ({ ...r, cursorDone: true, hinted: false, misclicks: 0 }));
    setPlaying(next === 'watch');
    if (currentStep) setActiveStepId(currentStep.id);
  };

  // Guided mode: auto-advance timer (no setState calls — setProgress only from interval cb)
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    progressRef.current = 0;
    voiceHeldRef.current = false;
    // Reset display progress at step start (also for zero/unlimited durations).
    setProgress(0);

    if (stepDurationRef.current <= 0) return;

    const interval = 100;
    timerRef.current = setInterval(() => {
      const duration = stepDurationRef.current;
      if (duration <= 0) return;
      progressRef.current += interval / duration;
      setProgress(Math.min(progressRef.current, 1));
      if (progressRef.current >= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        // Don't auto-advance if it's a question that hasn't been answered.
        // Read from the ref (not the state closure) so answering a question
        // doesn't recreate startTimer and restart the timer from zero.
        if (
          currentStep?.interactionType === 'question' &&
          currentStep.id &&
          !answeredStepsRef.current.has(currentStep.id)
        ) {
          return;
        }
        // Read-aloud: the step lasts until the voice finishes too.
        if (speakingRef.current) {
          voiceHeldRef.current = true;
          return;
        }
        if (currentStep) emitRef.current('complete', currentStep.id);
        goNext();
      }
    }, interval);
  }, [currentStep, answeredStepsRef, goNext]);

  // Watch holds the step's clock until the cursor has landed.
  const timerRuns = autoAdvance && playing && !watchGlide;
  useEffect(() => {
    if (timerRuns) {
      startTimer();
    } else {
      // Pause freezes in-step progress; resume restarts the step's timer.
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRuns, currentIdx, startTimer]);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const container = containerRef.current;
    const activeElement = document.activeElement;
    const hasKeyboardFocus = Boolean(
      container && activeElement && container.contains(activeElement)
    );
    const isHovered = Boolean(container?.matches(':hover'));
    if (!hasKeyboardFocus && !isHovered) return;

    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'BUTTON' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'A' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (event.key === 'Escape') {
      setActiveStepId(null);
      return;
    }

    if (mode === 'structured' || mode === 'guided') {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
        return;
      }
    }

    const onStage = Boolean(target?.hasAttribute('data-gl-stage'));
    // Try: Enter or Space on the focused stage activates the target.
    if (
      isTry &&
      onStage &&
      currentStep &&
      currentTargeted &&
      (event.key === 'Enter' || event.code === 'Space')
    ) {
      event.preventDefault();
      completeTryStep({ xPct: currentStep.xPct, yPct: currentStep.yPct });
      return;
    }

    if (autoAdvance && event.code === 'Space' && onStage) {
      event.preventDefault();
      setPlaying((prev) => !prev);
    }
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Remember the learner's place; skipped while the resume question is open.
  useEffect(() => {
    if (!v2Playback || resumeOffer) return;
    writeResume({
      id: set.id,
      idx: currentIdx,
      mode: playback,
      updatedAt: Date.now(),
    });
  }, [v2Playback, resumeOffer, set.id, currentIdx, playback]);

  const resumeAt = (idx: number, next: PlaybackMode) => {
    dismissResume();
    setPlayback(next);
    jumpTo(Math.min(Math.max(idx, 0), steps.length - 1));
  };

  const handlePinClick = (step: GuidedLearningPublicStep) => {
    if (mode === 'explore') {
      setExploreImageIndex(step.imageIndex ?? 0);
      setActiveStepId((prev) => (prev === step.id ? null : step.id));
    }
  };

  const handleAnswer = (
    stepId: string,
    answer: string | string[],
    isCorrect: boolean | null
  ) => {
    setAnsweredSteps((prev) => new Set([...prev, stepId]));
    onAnswer?.(stepId, answer, isCorrect);
  };

  // Whole-session fraction for the guided footer bar (step + in-step timer).
  const guidedProgress =
    steps.length > 0
      ? Math.min((currentIdx + Math.min(progress, 1)) / steps.length, 1)
      : 0;

  const readAloudToggle = (
    <button
      type="button"
      aria-pressed={readAloud}
      aria-label={t('glPlayer.readAloud')}
      title={t('glPlayer.readAloud')}
      onClick={() => {
        // Turning it off mid-hold releases the Watch step the voice was holding.
        if (readAloud) handleVoiceDone();
        setReadAloud(!readAloud);
      }}
      className={`flex items-center justify-center rounded-full border transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 ${
        readAloud
          ? 'bg-white text-slate-900 border-white'
          : 'bg-white/10 text-slate-200 border-white/15 hover:bg-white/20'
      }`}
      style={{ width: 'min(36px, 5.5cqmin)', height: 'min(36px, 5.5cqmin)' }}
    >
      {readAloud ? (
        <Volume2
          aria-hidden="true"
          style={{ width: 'min(18px, 3cqmin)', height: 'min(18px, 3cqmin)' }}
        />
      ) : (
        <VolumeX
          aria-hidden="true"
          style={{ width: 'min(18px, 3cqmin)', height: 'min(18px, 3cqmin)' }}
        />
      )}
    </button>
  );

  // Screen-reader announcement of the step now on screen.
  const announcedStep = mode === 'explore' ? activeStep : currentStep;
  const announcedIdx = announcedStep ? steps.indexOf(announcedStep) : -1;
  const liveText =
    playerV2 && announcedStep && !watchGlide
      ? t('glPlayer.live', {
          current: announcedIdx + 1,
          total: steps.length,
          text: spokenStepText(announcedStep),
        })
      : '';

  const footerKind: 'structured' | 'guided' = v2Playback
    ? isWatch
      ? 'guided'
      : 'structured'
    : mode === 'guided'
      ? 'guided'
      : 'structured';

  const jumpTo = (i: number) => {
    progressRef.current = 0;
    setProgress(0);
    setCurrentIdx(i);
    setActiveStepId(steps[i]?.id ?? null);
  };

  // Media end only advances while guided playback runs; a question's Continue always does.
  const handleStageAdvance = () => {
    const type = activeStep?.interactionType;
    if (type === 'audio' || type === 'video') {
      if (autoAdvance && playing) goNext();
      return;
    }
    if (mode !== 'explore') goNext();
    else setActiveStepId(null);
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Controls bar */}
      <div
        className="flex items-center border-b border-white/10 flex-shrink-0 bg-slate-900/90 backdrop-blur-sm"
        style={{
          gap: 'min(8px, 2cqmin)',
          padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
        }}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close player"
          >
            <X
              style={{
                width: 'min(16px, 4cqmin)',
                height: 'min(16px, 4cqmin)',
              }}
            />
          </button>
        )}
        <span
          className="text-white font-bold flex-1 truncate"
          style={{ fontSize: 'min(14px, 4cqmin)' }}
        >
          {set.title}
        </span>

        {mode === 'explore' && (
          <div
            className="flex items-center flex-wrap"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <span
              className="text-slate-400 font-medium"
              style={{ fontSize: 'min(11px, 3cqmin)' }}
            >
              Click any pin to explore
            </span>
            {set.imageUrls.length > 1 && (
              <div
                className="flex items-center flex-wrap"
                style={{ gap: 'min(6px, 1.5cqmin)' }}
              >
                {set.imageUrls.map((_, imageIndex) => (
                  <button
                    key={`image-${imageIndex}`}
                    onClick={() => {
                      setExploreImageIndex(imageIndex);
                      setActiveStepId(null);
                    }}
                    className={`rounded border font-bold transition-colors ${
                      imageIndex === currentImageIndex
                        ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200'
                        : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                    style={{
                      padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                      fontSize: 'min(10px, 2.6cqmin)',
                    }}
                    aria-label={`Show slide ${imageIndex + 1}`}
                  >
                    Slide {imageIndex + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-slate-950"
      >
        <GuidedLearningStage
          set={set}
          steps={steps}
          imageIndex={currentImageIndex}
          activeStepId={watchGlide ? null : activeStepId}
          currentStepId={cameraStep?.id ?? null}
          authorMode={mode}
          answeredStepIds={answeredSteps}
          teacherMode={teacherMode}
          zoomScale={zoomScale}
          onPinClick={(stepId) => {
            const step = steps.find((st) => st.id === stepId);
            if (step) handlePinClick(step);
          }}
          onAnswer={handleAnswer}
          onAdvance={handleStageAdvance}
          onDismiss={() => setActiveStepId(null)}
          onResetZoom={() => setZoomScale(1)}
          motionSpeed={playerV2 ? speed : undefined}
          cursor={cursorCue}
          onTargetClick={
            isTry && currentTargeted ? handleTargetClick : undefined
          }
          misclickCount={stepRun.misclicks}
          accessibleOverlays={playerV2}
        />
        {resumeOffer && (
          <ResumePrompt
            stepNumber={resumeOffer.idx + 1}
            onResume={() => resumeAt(resumeOffer.idx, resumeOffer.mode)}
            onStartOver={dismissResume}
          />
        )}
        <div aria-live="polite" className="sr-only" data-testid="gl-live">
          {liveText}
        </div>
      </div>

      {/* Bottom nav footer — structured and guided modes only; v2 follows Watch/Try */}
      {mode !== 'explore' && steps.length > 0 && (
        <div
          className="flex items-center flex-shrink-0 border-t border-white/10 bg-slate-900/80 backdrop-blur-md"
          style={{
            gap: 'min(10px, 2.5cqmin)',
            padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
          }}
        >
          {v2Playback && (
            <PlaybackModeToggle mode={playback} onChange={choosePlayback} />
          )}
          {footerKind === 'structured' ? (
            <>
              <button
                onClick={goPrev}
                disabled={currentIdx === 0}
                aria-label="Previous step"
                className="flex items-center justify-center rounded-full bg-white/10 border border-white/15 hover:bg-white/20 disabled:opacity-40 text-white transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
                style={{
                  width: 'min(44px, 6cqmin)',
                  height: 'min(44px, 6cqmin)',
                }}
              >
                <ChevronLeft
                  style={{
                    width: 'min(24px, 3.5cqmin)',
                    height: 'min(24px, 3.5cqmin)',
                  }}
                />
              </button>
              {steps.length > 20 ? (
                <div
                  role="progressbar"
                  aria-label="Step progress"
                  aria-valuemin={1}
                  aria-valuemax={steps.length}
                  aria-valuenow={currentIdx + 1}
                  className="flex-1 rounded-full bg-white/10 overflow-hidden"
                  style={{ height: 'clamp(6px, 1.5cqmin, 10px)' }}
                >
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-200"
                    style={{
                      width: `${((currentIdx + 1) / steps.length) * 100}%`,
                    }}
                  />
                </div>
              ) : steps.length === 1 ? (
                <div className="flex-1" />
              ) : (
                <div
                  className="flex-1 flex items-center justify-center flex-wrap"
                  style={{ gap: 'min(4px, 1cqmin)' }}
                >
                  {steps.map((s, i) => (
                    <button
                      key={s.id}
                      onClick={() => jumpTo(i)}
                      className={`rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 ${
                        i === currentIdx
                          ? 'bg-indigo-500'
                          : 'bg-slate-600 hover:bg-slate-500'
                      }`}
                      style={{
                        width:
                          i === currentIdx
                            ? 'clamp(20px, 5cqmin, 36px)'
                            : 'clamp(8px, 2cqmin, 14px)',
                        height: 'clamp(8px, 2cqmin, 14px)',
                      }}
                      aria-label={`Go to step ${i + 1}`}
                      aria-current={i === currentIdx ? 'step' : undefined}
                    />
                  ))}
                </div>
              )}
              {readAloudAvailable && readAloudToggle}
              {playerV2 && <SpeedControl speed={speed} onChange={setSpeed} />}
              {v2Playback ? (
                <StepOutline
                  steps={steps}
                  currentIdx={currentIdx}
                  doneIds={doneIds}
                  showSlides={set.imageUrls.length > 1}
                  canJump={(i) => !isTry || i <= currentIdx}
                  onJump={jumpTo}
                />
              ) : (
                <span
                  className="text-slate-300 font-bold tabular-nums"
                  style={{ fontSize: 'min(12px, 3.2cqmin)' }}
                >
                  {currentIdx + 1} / {steps.length}
                </span>
              )}
              <button
                onClick={goNext}
                disabled={currentIdx === steps.length - 1}
                aria-label="Next step"
                className="flex items-center justify-center rounded-full bg-white/10 border border-white/15 hover:bg-white/20 disabled:opacity-40 text-white transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
                style={{
                  width: 'min(44px, 6cqmin)',
                  height: 'min(44px, 6cqmin)',
                }}
              >
                <ChevronRight
                  style={{
                    width: 'min(24px, 3.5cqmin)',
                    height: 'min(24px, 3.5cqmin)',
                  }}
                />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={goPrev}
                disabled={currentIdx === 0}
                aria-label="Previous step"
                className="flex items-center justify-center rounded-full bg-white/10 border border-white/15 hover:bg-white/20 disabled:opacity-40 text-white transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
                style={{
                  width: 'min(44px, 6cqmin)',
                  height: 'min(44px, 6cqmin)',
                }}
              >
                <ChevronLeft
                  style={{
                    width: 'min(24px, 3.5cqmin)',
                    height: 'min(24px, 3.5cqmin)',
                  }}
                />
              </button>
              <button
                onClick={() => setPlaying((v) => !v)}
                aria-label={playing ? 'Pause' : 'Play'}
                className="flex items-center justify-center rounded-full bg-white/10 border border-white/15 hover:bg-white/20 text-white transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
                style={{
                  width: 'min(44px, 6cqmin)',
                  height: 'min(44px, 6cqmin)',
                }}
              >
                {playing ? (
                  <Pause
                    style={{
                      width: 'min(24px, 3.5cqmin)',
                      height: 'min(24px, 3.5cqmin)',
                    }}
                  />
                ) : (
                  <Play
                    style={{
                      width: 'min(24px, 3.5cqmin)',
                      height: 'min(24px, 3.5cqmin)',
                    }}
                  />
                )}
              </button>
              {v2Playback ? (
                <WatchScrubber
                  count={steps.length}
                  index={currentIdx}
                  progress={progress}
                  onSeek={jumpTo}
                />
              ) : (
                <div
                  role="progressbar"
                  aria-label="Session progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(guidedProgress * 100)}
                  className="flex-1 rounded-full bg-white/10 overflow-hidden"
                  style={{ height: 'clamp(6px, 1.5cqmin, 10px)' }}
                >
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-100"
                    style={{ width: `${guidedProgress * 100}%` }}
                  />
                </div>
              )}
              {readAloudAvailable && readAloudToggle}
              {playerV2 && <SpeedControl speed={speed} onChange={setSpeed} />}
              {v2Playback ? (
                <StepOutline
                  steps={steps}
                  currentIdx={currentIdx}
                  doneIds={doneIds}
                  showSlides={set.imageUrls.length > 1}
                  canJump={(i) => !isTry || i <= currentIdx}
                  onJump={jumpTo}
                />
              ) : (
                <span
                  className="text-slate-300 font-bold tabular-nums"
                  style={{ fontSize: 'min(12px, 3.2cqmin)' }}
                >
                  {currentIdx + 1} / {steps.length}
                </span>
              )}
              <button
                onClick={goNext}
                disabled={currentIdx === steps.length - 1}
                aria-label="Next step"
                className="flex items-center justify-center rounded-full bg-white/10 border border-white/15 hover:bg-white/20 disabled:opacity-40 text-white transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
                style={{
                  width: 'min(44px, 6cqmin)',
                  height: 'min(44px, 6cqmin)',
                }}
              >
                <ChevronRight
                  style={{
                    width: 'min(24px, 3.5cqmin)',
                    height: 'min(24px, 3.5cqmin)',
                  }}
                />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
