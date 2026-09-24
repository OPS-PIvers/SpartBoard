import React, {
  useState,
  useEffect,
  useEffectEvent,
  useRef,
  useCallback,
  useMemo,
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
  GuidedLearningStep,
  GuidedLearningPublicStep,
  GuidedLearningMode,
  StudentOverride,
} from '@/types';
import { toPublicStep } from '@/hooks/useGuidedLearningSession';
import type { QuestionAnswerKey } from './interactions/QuestionInteraction';
import { isGuidedLearningSetV2 } from '../utils/setMigration';
import { stepDurationMs } from '../utils/motion';
import {
  GuidedLearningStage,
  type StageCursorCue,
} from './GuidedLearningStage';
import { SpeedControl } from './player/SpeedControl';
import { useLearnerSpeed } from './player/useLearnerSpeed';
import { WatchScrubber } from './player/WatchScrubber';
import {
  TRY_HINT_MS,
  defaultPlayback,
  hasStepTarget,
  holdsForMedia,
} from './player/playback';
import { StepOutline } from './player/StepOutline';
import { FooterOverflow } from './player/FooterOverflow';
import { TouchHitBox } from './player/TouchHitBox';
import { ResumePrompt } from './player/ResumePrompt';
import { useResumeOffer, writeResume } from './player/useResume';
import { speechAvailable, useReadAloud } from './player/useReadAloud';
import { spokenStepText } from '../utils/stepText';
import type { PctPoint, PlaybackMode, StepEvent } from '../types/stage';

const nowMs = (): number => performance.now();

/** Each question step's key, read from the author's copy. */
function answerKeysOf(
  steps: readonly GuidedLearningStep[]
): ReadonlyMap<string, QuestionAnswerKey> {
  const keys = new Map<string, QuestionAnswerKey>();
  for (const s of steps) {
    if (s.interactionType !== 'question' || !s.question) continue;
    keys.set(s.id, {
      correctAnswer: s.question.correctAnswer,
      matchingPairs: s.question.matchingPairs,
      sortingItems: s.question.sortingItems,
    });
  }
  return keys;
}

/** Step keys in v2: arrows plus a presentation clicker's PageUp/PageDown. */
const NAV_KEYS_V2 = ['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'];

/** v2 callout, question and footer text scales up to projector size. */
const PROJECTOR_TEXT_VARS = {
  '--gl-text-title': 'clamp(14px, 4.4cqmin, 30px)',
  '--gl-text-body': 'clamp(14px, 3.8cqmin, 28px)',
  '--gl-text-small': 'clamp(14px, 3cqmin, 22px)',
  '--gl-callout-max-w': 'min(max(340px, 50cqmin), 60cqw)',
  '--gl-popover-max-w': 'min(max(380px, 56cqmin), 90cqw)',
  '--gl-question-max-w': 'min(max(420px, 64cqmin), 90cqw)',
} as React.CSSProperties;

/** Below this player width, v2 moves speed and read-aloud into an overflow menu. */
export const FOOTER_COMPACT_PX = 520;

const FOOTER_BUTTON_SIZE: React.CSSProperties = {
  width: 'min(44px, 6cqmin)',
  height: 'min(44px, 6cqmin)',
};
const FOOTER_ICON_SIZE: React.CSSProperties = {
  width: 'min(24px, 3.5cqmin)',
  height: 'min(24px, 3.5cqmin)',
};

/** Per-visit state of the current step; replaced whenever the step changes. */
interface StepRun {
  idx: number;
  seq: number;
  prevIdx: number | null;
  cursorDone: boolean;
  misclicks: number;
  hinted: boolean;
  lastMiss: PctPoint | null;
  mediaEnded: boolean;
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
  /** Questions already answered on an earlier visit (read on mount). */
  initialAnsweredStepIds?: readonly string[];
  /** v2: saved answers (read on mount); each question reopens on its own. */
  initialAnswers?: readonly {
    stepId: string;
    answer: string | string[];
  }[];
  /** v2: the progress doc's furthest step, offered when this device saved no place. */
  resumeServerIdx?: number | null;
  /** v2 guided sets start playing on mount (the student app, after Start). */
  autoPlay?: boolean;
  /** v2: moving on from the last step (timer, target, Next or Continue) finishes the run. */
  onReachedEnd?: () => void;
  /** v2 subs and teacher's board: the student UI, with a Reveal answer button per question. */
  revealAnswers?: boolean;
  /** v2: the host covers the player (period paused, finishing card); clock, media, voice and keys stop. */
  held?: boolean;
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
  initialAnsweredStepIds,
  initialAnswers,
  resumeServerIdx,
  autoPlay = false,
  onReachedEnd,
  revealAnswers = false,
  held = false,
}) => {
  const { t } = useTranslation();
  const mode: GuidedLearningMode = set.mode;
  // In teacher mode set.steps is GuidedLearningStep[]; in student mode it is
  // GuidedLearningPublicStep[] (via the student-app cast). We intentionally
  // narrow to GuidedLearningPublicStep[] here so interaction components never
  // accidentally read answer-key fields from steps. Answer keys are accessed
  // through set.steps.find() only when teacherMode is true (see GuidedLearningStage).
  // Reveal mode plays the student mirror; the keys stay behind Reveal answer.
  const revealMode = playerV2 && revealAnswers && !teacherMode;
  const publicSteps = useMemo(
    () => (revealMode ? set.steps.map(toPublicStep) : null),
    [revealMode, set.steps]
  );
  const revealKeys = useMemo(
    () => (revealMode ? answerKeysOf(set.steps) : undefined),
    [revealMode, set.steps]
  );
  const steps =
    publicSteps ?? (set.steps as unknown as GuidedLearningPublicStep[]);
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
  const [playing, setPlaying] = useState(
    autoPlay && playerV2 && mode === 'guided'
  );
  const [progress, setProgress] = useState(0); // 0-1 for guided auto-advance
  const [answeredSteps, setAnsweredSteps] = useState<Set<string>>(
    () =>
      new Set([
        ...(initialAnsweredStepIds ?? []),
        ...(initialAnswers ?? []).map((a) => a.stepId),
      ])
  );
  const [answerMap, setAnswerMap] = useState<
    ReadonlyMap<string, string | string[]>
  >(() => new Map((initialAnswers ?? []).map((a) => [a.stepId, a.answer])));
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

  // The author's mode is the only choice: guided plays as Watch, structured as Try.
  const playback: PlaybackMode = defaultPlayback(mode);

  // Track previous mode to reset step index when mode changes (adjusting state while rendering)
  const [prevMode, setPrevMode] = useState(mode);
  if (prevMode !== mode) {
    setPrevMode(mode);
    if (mode !== 'explore' && steps.length > 0) {
      setCurrentIdx(0);
      setActiveStepId(steps[0].id);
    } else if (mode === 'explore') {
      setActiveStepId(null);
      setExploreImageIndex(0);
    }
  }

  // Keyboard scope: the whole player in v2, the canvas wrapper in v1.
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // v2: the player's width, for the footer's overflow breakpoint.
  const [rootWidth, setRootWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!playerV2 || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === 'number') setRootWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [playerV2]);
  const compactFooter =
    playerV2 && rootWidth !== null && rootWidth < FOOTER_COMPACT_PX;
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
    v2Playback,
    resumeServerIdx,
    currentIdx === startIdx
  );
  const [readAloud, setReadAloud] = useState(false);
  const readAloudAvailable =
    v2Playback &&
    (speechAvailable() || steps.some((s) => Boolean(s.narration?.url)));
  const isWatch = v2Playback && playback === 'watch';
  const isTry = v2Playback && playback === 'try';
  const autoAdvance = v2Playback ? isWatch : mode === 'guided';
  const isHeld = playerV2 && held;

  const [run, setRun] = useState<StepRun>({
    idx: currentIdx,
    seq: 0,
    prevIdx: null,
    cursorDone: false,
    misclicks: 0,
    hinted: false,
    lastMiss: null,
    mediaEnded: false,
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
      mediaEnded: false,
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
    enabled: readAloud && readAloudAvailable && !resumeOffer && !isHeld,
    step: currentStep,
    stepKey: currentStep && !watchGlide ? `${stepRun.seq}` : null,
    onDone: handleVoiceDone,
  });
  const speakingRef = useRef(speaking);
  // eslint-disable-next-line react-hooks/refs
  speakingRef.current = speaking;
  // v2: audio and uploaded or YouTube video hold the step clock until they end.
  const mediaHeldRef = useRef(false);
  // eslint-disable-next-line react-hooks/refs
  mediaHeldRef.current =
    v2Playback && holdsForMedia(currentStep) && !stepRun.mediaEnded;
  // v2: a dismissed or failed clip lets the step clock run again.
  const releaseMedia = () => {
    if (!v2Playback) return;
    setRun((r) => (r.seq === stepRun.seq ? { ...r, mediaEnded: true } : r));
  };
  const dismissActive = () => {
    if (activeStepId !== null && activeStepId === currentStep?.id) {
      releaseMedia();
    }
    setActiveStepId(null);
  };

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
  // The run whose 'complete' was already sent, so finishing never sends it twice.
  const completedSeqRef = useRef<number | null>(null);
  const seqRef = useRef(stepRun.seq);
  // eslint-disable-next-line react-hooks/refs
  seqRef.current = stepRun.seq;
  const emitStepEvent = (
    type: StepEvent['type'],
    stepId: string,
    at?: PctPoint
  ) => {
    if (type === 'complete') completedSeqRef.current = stepRun.seq;
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

  // A ref, so a new parent callback never restarts the step timer.
  const onReachedEndRef = useRef(onReachedEnd);
  // eslint-disable-next-line react-hooks/refs
  onReachedEndRef.current = onReachedEnd;
  const goNext = useCallback(() => {
    if (steps.length === 0) return;
    // Already on the final step — nothing to advance to. Bail out instead of
    // resetting progress to 0, so a completed session's bar holds at 100%
    // rather than dropping back down (auto-advance timer, Continue button,
    // and ArrowRight can all reach this once the last step is done).
    const leaving = steps[currentIdx];
    if (leaving) markDone(leaving.id);
    if (currentIdx >= steps.length - 1) {
      if (playerV2) {
        if (leaving && completedSeqRef.current !== seqRef.current) {
          emitRef.current('complete', leaving.id);
        }
        onReachedEndRef.current?.();
      }
      return;
    }
    // New step starts with a fresh in-step timer/progress (dot-jump semantics).
    progressRef.current = 0;
    setProgress(0);
    setCurrentIdx((prev) => {
      const next = Math.min(prev + 1, steps.length - 1);
      setActiveStepId(steps[next]?.id ?? null);
      return next;
    });
  }, [steps, currentIdx, markDone, playerV2]);

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
        // Held media keeps the clock ticking at the end until it ends or is released.
        if (mediaHeldRef.current) return;
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

  // Watch holds the step's clock until the cursor has landed and the resume question is answered.
  const timerRuns =
    autoAdvance && playing && !watchGlide && !resumeOffer && !isHeld;
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
    if (event.defaultPrevented || isHeld) return;
    // v2 listens anywhere in the player; v1 only over the canvas.
    const scope = playerV2 ? rootRef.current : containerRef.current;
    const activeElement = document.activeElement;
    const hasKeyboardFocus = Boolean(
      scope && activeElement && scope.contains(activeElement)
    );
    const isHovered = Boolean(scope?.matches(':hover'));
    if (!hasKeyboardFocus && !isHovered) return;

    const target = event.target as HTMLElement | null;
    const navKey = playerV2
      ? NAV_KEYS_V2.includes(event.key)
      : event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    // v2: step keys still work while a footer button (not the outline list) has focus.
    const footerButton =
      playerV2 &&
      navKey &&
      Boolean(scope && target && scope.contains(target)) &&
      Boolean(target?.closest('[data-gl-footer]')) &&
      !target?.closest('[role="dialog"]');
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable ||
        ((target.tagName === 'BUTTON' || target.tagName === 'A') &&
          !footerButton))
    ) {
      return;
    }

    if (event.key === 'Escape') {
      dismissActive();
      return;
    }

    if ((mode === 'structured' || mode === 'guided') && navKey) {
      event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') goPrev();
      else goNext();
      return;
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

  const resumeAt = (idx: number) => {
    dismissResume();
    jumpTo(Math.min(Math.max(idx, 0), steps.length - 1));
  };

  const handlePinClick = (step: GuidedLearningPublicStep) => {
    if (mode === 'explore') {
      setExploreImageIndex(step.imageIndex ?? 0);
      setActiveStepId((prev) => (prev === step.id ? null : step.id));
      return;
    }
    // Structured/guided: the current step's pin reopens a dismissed step.
    if (step.id === currentStep?.id) setActiveStepId(step.id);
  };

  const handleAnswer = (
    stepId: string,
    answer: string | string[],
    isCorrect: boolean | null
  ) => {
    setAnsweredSteps((prev) => new Set([...prev, stepId]));
    setAnswerMap((prev) => new Map(prev).set(stepId, answer));
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
      className={`relative flex items-center justify-center rounded-full border transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 ${
        readAloud
          ? 'bg-white text-slate-900 border-white'
          : 'bg-white/10 text-slate-200 border-white/15 hover:bg-white/20'
      }`}
      style={{ width: 'min(36px, 5.5cqmin)', height: 'min(36px, 5.5cqmin)' }}
    >
      <TouchHitBox round />
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

  const footerButtonClass = `${playerV2 ? 'relative ' : ''}flex items-center justify-center rounded-full bg-white/10 border border-white/15 hover:bg-white/20 text-white transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90`;

  // v2 with a finish handler: Next on the last step finishes.
  const nextDisabled =
    currentIdx === steps.length - 1 && !(playerV2 && onReachedEnd);

  const jumpTo = (i: number) => {
    progressRef.current = 0;
    setProgress(0);
    setCurrentIdx(i);
    setActiveStepId(steps[i]?.id ?? null);
  };

  // Media end only advances while guided playback runs; a question's Continue always does.
  const handleStageAdvance = () => {
    const type = activeStep?.interactionType;
    // v2: nothing under the resume question or a host hold moves the step.
    const blocked = resumeOffer !== null || isHeld;
    if (type === 'audio' || type === 'video') {
      if (v2Playback) {
        releaseMedia();
        if (autoAdvance && playing && currentStep && !blocked) {
          emitStepEvent('complete', currentStep.id);
        }
      }
      if (autoAdvance && playing && !blocked) goNext();
      return;
    }
    if (mode !== 'explore') {
      if (!blocked) goNext();
    } else setActiveStepId(null);
  };

  return (
    <div
      ref={rootRef}
      data-testid="gl-player-root"
      className="h-full flex flex-col bg-slate-900"
      style={playerV2 ? PROJECTOR_TEXT_VARS : undefined}
    >
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
            className="text-slate-300 hover:text-white transition-colors"
            aria-label={t('glPlayer.closePlayer')}
          >
            <X
              aria-hidden="true"
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

        {playerV2 && (
          <span
            data-testid="gl-mode-chip"
            className="rounded-full bg-white/10 border border-white/15 text-slate-200 font-semibold whitespace-nowrap flex-shrink-0"
            style={{
              padding: 'min(3px, 0.8cqmin) min(10px, 2.4cqmin)',
              fontSize: 'var(--gl-text-small, min(12px, 3.2cqmin))',
            }}
          >
            {t(`glPlayer.modeChip.${mode}`)}
          </span>
        )}

        {mode === 'explore' && (
          <div
            className="flex items-center flex-wrap"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            {!playerV2 && (
              <span
                className="text-slate-300 font-medium"
                style={{ fontSize: 'min(11px, 3cqmin)' }}
              >
                {t('glPlayer.exploreHint')}
              </span>
            )}
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
                    aria-label={t('glPlayer.showSlide', { n: imageIndex + 1 })}
                  >
                    {t('glPlayer.outline.slide', { n: imageIndex + 1 })}
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
          onDismiss={dismissActive}
          onMediaError={releaseMedia}
          mediaPaused={isHeld}
          onResetZoom={() => setZoomScale(1)}
          motionSpeed={playerV2 ? speed : undefined}
          cursor={cursorCue}
          onTargetClick={
            isTry && currentTargeted ? handleTargetClick : undefined
          }
          misclickCount={stepRun.misclicks}
          accessibleOverlays={playerV2}
          youtubeEndEvents={playerV2}
          revealKeys={revealKeys}
          touchTargets={playerV2}
          slideLoading={playerV2}
          priorAnswers={playerV2 && !teacherMode ? answerMap : undefined}
        />
        {resumeOffer && (
          <ResumePrompt
            stepNumber={resumeOffer.idx + 1}
            onResume={() => resumeAt(resumeOffer.idx)}
            onStartOver={dismissResume}
          />
        )}
        <div aria-live="polite" className="sr-only" data-testid="gl-live">
          {liveText}
        </div>
        {isTry && (
          <div
            aria-live="polite"
            className="sr-only"
            data-testid="gl-miss-live"
          >
            {stepRun.misclicks > 0 && (
              <span key={`${stepRun.seq}-${stepRun.misclicks}`}>
                {t('glPlayer.miss')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom nav footer — structured and guided modes only; v2 follows Watch/Try */}
      {mode !== 'explore' && steps.length > 0 && (
        <div
          data-gl-footer
          className="flex items-center flex-shrink-0 border-t border-white/10 bg-slate-900/80 backdrop-blur-md"
          style={{
            gap: 'min(10px, 2.5cqmin)',
            padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
          }}
        >
          <button
            onClick={goPrev}
            disabled={currentIdx === 0}
            aria-label={t('glPlayer.prev')}
            className={`${footerButtonClass} disabled:opacity-40`}
            style={FOOTER_BUTTON_SIZE}
          >
            {playerV2 && <TouchHitBox round />}
            <ChevronLeft style={FOOTER_ICON_SIZE} />
          </button>
          {footerKind === 'guided' && (
            <button
              onClick={() => setPlaying((v) => !v)}
              aria-label={playing ? t('glPlayer.pause') : t('glPlayer.play')}
              className={footerButtonClass}
              style={FOOTER_BUTTON_SIZE}
            >
              {playerV2 && <TouchHitBox round />}
              {playing ? (
                <Pause style={FOOTER_ICON_SIZE} />
              ) : (
                <Play style={FOOTER_ICON_SIZE} />
              )}
            </button>
          )}
          {footerKind === 'guided' ? (
            v2Playback ? (
              <WatchScrubber
                count={steps.length}
                index={currentIdx}
                progress={progress}
                onSeek={jumpTo}
              />
            ) : (
              <div
                role="progressbar"
                aria-label={t('glPlayer.sessionProgress')}
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
            )
          ) : steps.length > 20 ? (
            <div
              role="progressbar"
              aria-label={t('glPlayer.stepProgress')}
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
                  className={`${playerV2 ? 'relative ' : ''}rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 ${
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
                  aria-label={t('glPlayer.goToStep', { n: i + 1 })}
                  aria-current={i === currentIdx ? 'step' : undefined}
                >
                  {playerV2 && (
                    <TouchHitBox width="calc(100% + min(4px, 1cqmin))" />
                  )}
                </button>
              ))}
            </div>
          )}
          {compactFooter ? (
            <FooterOverflow>
              {readAloudAvailable && readAloudToggle}
              <SpeedControl speed={speed} onChange={setSpeed} />
            </FooterOverflow>
          ) : (
            <>
              {readAloudAvailable && readAloudToggle}
              {playerV2 && <SpeedControl speed={speed} onChange={setSpeed} />}
            </>
          )}
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
            disabled={nextDisabled}
            aria-label={t('glPlayer.next')}
            className={`${footerButtonClass} disabled:opacity-40`}
            style={FOOTER_BUTTON_SIZE}
          >
            {playerV2 && <TouchHitBox round />}
            <ChevronRight style={FOOTER_ICON_SIZE} />
          </button>
        </div>
      )}
    </div>
  );
};
