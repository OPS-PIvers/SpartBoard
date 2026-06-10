import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  GuidedLearningSet,
  GuidedLearningPublicStep,
  GuidedLearningMode,
} from '@/types';
import { TextPopoverInteraction } from './interactions/TextPopoverInteraction';
import { TooltipInteraction } from './interactions/TooltipInteraction';
import { AudioInteraction } from './interactions/AudioInteraction';
import { VideoInteraction } from './interactions/VideoInteraction';
import { SpotlightInteraction } from './interactions/SpotlightInteraction';
import { QuestionInteraction } from './interactions/QuestionInteraction';
import { BannerInteraction } from './interactions/BannerInteraction';
import {
  calculateImageFootprint,
  toContainerCoords,
  toImageOffset,
} from '../utils/imageUtils';

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
}

export const GuidedLearningPlayer: React.FC<Props> = ({
  set,
  onClose,
  onAnswer,
  teacherMode = false,
}) => {
  const mode: GuidedLearningMode = set.mode;
  // Hotspot pulse style — 'consistent' (default) preserves the legacy ping
  // ring; 'reminder' adds a periodic wiggle on the marker itself; 'off'
  // disables both. All variants degrade to no-animation under
  // prefers-reduced-motion via the motion-reduce:* utilities.
  const pulseMode: 'consistent' | 'reminder' | 'off' =
    set.hotspotPulse ?? 'consistent';
  // Image-to-image transition style. 'none' = instant swap (legacy);
  // 'slide' = new image slides in from the right while previous exits left;
  // 'fade' = cross-dissolve. Reduces to 'none' under prefers-reduced-motion.
  const transitionMode: 'none' | 'slide' | 'fade' =
    set.imageTransition ?? 'none';
  // In teacher mode set.steps is GuidedLearningStep[]; in student mode it is
  // GuidedLearningPublicStep[] (via the student-app cast). We intentionally
  // narrow to GuidedLearningPublicStep[] here so interaction components never
  // accidentally read answer-key fields from steps. Answer keys are accessed
  // through set.steps.find() only when teacherMode is true (see renderInteraction).
  const steps = set.steps as unknown as GuidedLearningPublicStep[];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [activeStepId, setActiveStepId] = useState<string | null>(
    mode !== 'explore' ? (steps[0]?.id ?? null) : null
  );
  const [exploreImageIndex, setExploreImageIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1 for guided auto-advance
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    )
      return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

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

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);

  const [imgOffset, setImgOffset] = useState<{
    left: number;
    top: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);

  const measureImg = useCallback(() => {
    // Whichever media element is mounted for the current slide — <img> for
    // image slides, <video> for video slides.
    const media = imgRef.current ?? videoElRef.current;
    if (!media || !containerRef.current) {
      setImgOffset(null);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const footprint = calculateImageFootprint(
      media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth,
      media instanceof HTMLVideoElement
        ? media.videoHeight
        : media.naturalHeight,
      rect.width,
      rect.height
    );

    setImgOffset(toImageOffset(footprint, rect.width, rect.height));
  }, []);

  // Observe container size for overlay positioning
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        });
      }
      measureImg();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measureImg]);

  const currentStep = steps[currentIdx] ?? null;
  const activeStep = steps.find((s) => s.id === activeStepId) ?? null;
  const rawCurrentImageIndex =
    mode === 'explore' ? exploreImageIndex : (currentStep?.imageIndex ?? 0);
  const currentImageIndex =
    set.imageUrls.length === 0
      ? 0
      : Math.min(
          Math.max(rawCurrentImageIndex, 0),
          Math.max(set.imageUrls.length - 1, 0)
        );
  const currentImageUrl = set.imageUrls[currentImageIndex] ?? set.imageUrls[0];
  // Per-slide media kind — 'video' slides (uploaded MP4/WebM or screen
  // recordings) render in a muted looping <video>; missing entries are
  // images (legacy sets/sessions have no imageKinds field at all).
  const slideKind: 'image' | 'video' =
    set.imageKinds?.[currentImageIndex] ?? 'image';
  // Optional playback-range trim for the current video slide — the <video>
  // seeks to `start` on load and loops back when it reaches `end`. Missing
  // entries (and legacy sets/sessions) play the full file.
  const slideTrim = set.videoTrims?.[currentImageIndex] ?? null;

  // Image-transition bookkeeping — when `currentImageIndex` changes and a
  // transition is enabled, we briefly render the previous image as an
  // exiting layer alongside the current one. The "adjust state during
  // render" pattern detects the change without an effect; the
  // 500ms-cleanup effect below drops the previous layer once its
  // animation has finished.
  const transitionsActive = transitionMode !== 'none' && !prefersReducedMotion;
  const [prevImageIndex, setPrevImageIndex] = useState<number | null>(null);
  const [trackedImageIndex, setTrackedImageIndex] = useState(currentImageIndex);
  if (trackedImageIndex !== currentImageIndex) {
    if (transitionsActive) {
      setPrevImageIndex(trackedImageIndex);
    }
    setTrackedImageIndex(currentImageIndex);
  }
  useEffect(() => {
    if (prevImageIndex === null) return;
    const id = setTimeout(() => setPrevImageIndex(null), 500);
    return () => clearTimeout(id);
  }, [prevImageIndex]);
  // Skip the exit layer when the previous slide was a video — an <img>
  // can't render a video URL, so the transition falls back to an instant
  // swap for that case.
  const previousImageUrl =
    prevImageIndex !== null &&
    (set.imageKinds?.[prevImageIndex] ?? 'image') !== 'video'
      ? (set.imageUrls[prevImageIndex] ?? null)
      : null;

  const toContainerStep = useCallback(
    (step: GuidedLearningPublicStep | null) => {
      if (!step) return null;
      return {
        ...step,
        ...toContainerCoords(step.xPct, step.yPct, imgOffset),
      };
    },
    [imgOffset]
  );

  const activeStepInContainer = toContainerStep(activeStep);

  // Derive pan-zoom active state from current step (no effect needed)
  const panZoomTargetStep = mode === 'explore' ? activeStep : currentStep;
  const panZoomActive =
    panZoomTargetStep?.interactionType === 'pan-zoom' ||
    panZoomTargetStep?.interactionType === 'pan-zoom-spotlight'
      ? panZoomTargetStep.id
      : null;

  useEffect(() => {
    // Warm the browser cache for image slides so step navigation doesn't
    // flash. Video slides are intentionally skipped — preloading every MP4
    // up front would burn bandwidth; the <video> element streams on demand.
    set.imageUrls.forEach((url, i) => {
      if ((set.imageKinds?.[i] ?? 'image') === 'video') return;
      const image = new Image();
      image.src = url;
    });
  }, [set.imageUrls, set.imageKinds]);

  const goNext = useCallback(() => {
    if (steps.length === 0) return;
    setCurrentIdx((prev) => {
      const next = Math.min(prev + 1, steps.length - 1);
      setActiveStepId(steps[next]?.id ?? null);
      return next;
    });
  }, [steps]);

  const goPrev = useCallback(() => {
    if (steps.length === 0) return;
    setCurrentIdx((prev) => {
      const prevIdx = Math.max(prev - 1, 0);
      setActiveStepId(steps[prevIdx]?.id ?? null);
      return prevIdx;
    });
  }, [steps]);

  // Guided mode: auto-advance timer (no setState calls — setProgress only from interval cb)
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    progressRef.current = 0;

    const duration = (currentStep?.autoAdvanceDuration ?? 5) * 1000;
    if (duration <= 0) return;

    const interval = 100;
    timerRef.current = setInterval(() => {
      progressRef.current += interval / duration;
      setProgress(progressRef.current);
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
        goNext();
      }
    }, interval);
  }, [currentStep, answeredStepsRef, goNext]);

  useEffect(() => {
    if (mode === 'guided' && playing) {
      startTimer();
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      progressRef.current = 0;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode, playing, currentIdx, startTimer]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    )
      return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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

      if (mode === 'structured') {
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

      if (
        mode === 'guided' &&
        event.code === 'Space' &&
        target === containerRef.current
      ) {
        event.preventDefault();
        setPlaying((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, mode]);

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

  // Calculate pan-zoom transform
  const getPanZoomStyle = (): React.CSSProperties => {
    if (!panZoomActive || containerSize.w === 0) return {};
    const step = toContainerStep(
      steps.find((s) => s.id === panZoomActive) ?? null
    );
    if (!step) return {};
    const scale = step.panZoomScale ?? 2.5;
    // Translate so the hotspot is centred
    const tx =
      containerSize.w / 2 - (step.xPct / 100) * containerSize.w * scale;
    const ty =
      containerSize.h / 2 - (step.yPct / 100) * containerSize.h * scale;

    return {
      transform: `scale(${scale}) translate(${tx / scale}px, ${ty / scale}px)`,
      transition: prefersReducedMotion ? 'none' : 'transform 0.6s ease-in-out',
      transformOrigin: '0 0',
    };
  };

  const renderInteraction = () => {
    if (!activeStep) return null;
    const type = activeStep.interactionType;

    if (type === 'text-popover') {
      return (
        <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
          <div className="pointer-events-auto w-full h-full">
            <TextPopoverInteraction
              step={activeStep}
              onClose={() => setActiveStepId(null)}
            />
          </div>
        </div>
      );
    }

    if (type === 'audio') {
      return (
        <div className="absolute inset-0 z-30 pointer-events-none flex items-end justify-center pb-4">
          <div className="pointer-events-auto">
            <AudioInteraction
              step={activeStep}
              autoPlay
              onEnded={() => {
                if (mode === 'guided' && playing) goNext();
              }}
            />
          </div>
        </div>
      );
    }

    if (type === 'video') {
      return (
        <div className="absolute inset-0 z-30 pointer-events-auto">
          <VideoInteraction
            step={activeStep}
            onClose={() => setActiveStepId(null)}
            onEnded={() => {
              if (mode === 'guided' && playing) goNext();
            }}
          />
        </div>
      );
    }

    if (type === 'question') {
      // Find original step for answer key (teacher mode only)
      const origStep = teacherMode
        ? set.steps.find((s) => s.id === activeStep.id)
        : null;
      return (
        <div className="absolute inset-0 z-30 pointer-events-auto overflow-hidden">
          <QuestionInteraction
            step={activeStep}
            onAnswer={(answer, isCorrect) =>
              handleAnswer(activeStep.id, answer, isCorrect)
            }
            onContinue={() => {
              if (mode !== 'explore') goNext();
              else setActiveStepId(null);
            }}
            correctAnswer={origStep?.question?.correctAnswer}
            correctMatchingPairs={origStep?.question?.matchingPairs}
            correctSortingItems={origStep?.question?.sortingItems}
            studentMode={!teacherMode}
          />
        </div>
      );
    }

    if (type === 'tooltip') {
      return activeStepInContainer ? (
        <TooltipInteraction
          step={activeStepInContainer}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
        />
      ) : null;
    }

    if (
      type === 'pan-zoom' ||
      type === 'spotlight' ||
      type === 'pan-zoom-spotlight'
    ) {
      const overlay =
        activeStep.showOverlay === 'tooltip' && activeStepInContainer ? (
          <TooltipInteraction
            step={activeStepInContainer}
            containerWidth={containerSize.w}
            containerHeight={containerSize.h}
          />
        ) : activeStep.showOverlay === 'popover' ? (
          <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
            <div className="pointer-events-auto w-full h-full">
              <TextPopoverInteraction
                step={activeStep}
                onClose={() => setActiveStepId(null)}
              />
            </div>
          </div>
        ) : activeStep.showOverlay === 'banner' ? (
          <BannerInteraction
            step={activeStep}
            onClose={() => setActiveStepId(null)}
          />
        ) : null;

      if (
        (type === 'spotlight' || type === 'pan-zoom-spotlight') &&
        activeStepInContainer
      ) {
        return (
          <>
            <SpotlightInteraction
              step={activeStepInContainer}
              containerWidth={containerSize.w}
              containerHeight={containerSize.h}
              panZoomActive={Boolean(panZoomActive)}
            />
            {overlay}
          </>
        );
      }

      return overlay;
    }

    return null;
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

        {mode === 'structured' && steps.length > 0 && (
          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <span
              className="text-slate-300 font-bold"
              style={{ fontSize: 'min(11px, 3cqmin)' }}
            >
              {currentIdx + 1} / {steps.length}
            </span>
          </div>
        )}

        {mode === 'guided' && (
          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <button
              onClick={() => setPlaying((v) => !v)}
              className="text-white hover:text-indigo-300 transition-colors"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <Pause
                  style={{
                    width: 'min(20px, 5cqmin)',
                    height: 'min(20px, 5cqmin)',
                  }}
                />
              ) : (
                <Play
                  style={{
                    width: 'min(20px, 5cqmin)',
                    height: 'min(20px, 5cqmin)',
                  }}
                />
              )}
            </button>
            <span
              className="text-slate-300 font-bold"
              style={{ fontSize: 'min(11px, 3cqmin)' }}
            >
              {currentIdx + 1} / {steps.length}
            </span>
          </div>
        )}

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

      {/* Guided progress bar */}
      {mode === 'guided' && playing && (
        <div
          className="bg-slate-700 flex-shrink-0"
          style={{ height: 'min(3px, 0.8cqmin)' }}
        >
          <div
            className="h-full bg-indigo-500 transition-all duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {/* Main canvas */}
      <div className="flex-1 relative overflow-hidden bg-slate-950">
        <div
          ref={containerRef}
          className="w-full h-full relative flex items-center justify-center"
          tabIndex={0}
        >
          {/* Image with optional pan-zoom transform */}
          <div
            className="w-full h-full relative motion-reduce:transition-none"
            style={getPanZoomStyle()}
          >
            {/* Current image is always mounted — kept stable across image
                changes so React doesn't re-create the <img> node, which
                would invalidate refs held by callers/tests and force a
                fresh load even when the URL is unchanged. Video slides swap
                in a muted looping <video> (keyed by URL so the element
                reloads when the slide changes). */}
            {currentImageUrl && slideKind === 'video' && (
              <video
                key={currentImageUrl}
                ref={videoElRef}
                src={currentImageUrl}
                muted
                loop
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                onLoadedMetadata={(e) => {
                  measureImg();
                  if (slideTrim) e.currentTarget.currentTime = slideTrim.start;
                }}
                onTimeUpdate={(e) => {
                  // Loop within the trimmed playback range. The native
                  // `loop` attribute still covers the untrimmed case (and
                  // acts as a fallback if `end` is at/after the file end).
                  if (!slideTrim) return;
                  const el = e.currentTarget;
                  if (
                    el.currentTime >= slideTrim.end ||
                    el.currentTime < slideTrim.start - 0.25
                  ) {
                    el.currentTime = slideTrim.start;
                  }
                }}
              />
            )}
            {currentImageUrl && slideKind !== 'video' && (
              <img
                ref={imgRef}
                src={currentImageUrl}
                alt={set.title}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                draggable={false}
                onLoad={measureImg}
              />
            )}
            {/* Previous image — only mounted while a transition is in
                flight. Rendered ABOVE the current layer (later in DOM
                order, so it paints on top) and animates OUT, revealing
                the current image underneath. The cleanup effect drops
                this layer 500ms after mount. */}
            {previousImageUrl && (
              <img
                src={previousImageUrl}
                alt=""
                aria-hidden="true"
                className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${
                  transitionMode === 'slide'
                    ? 'animate-slide-left-out'
                    : transitionMode === 'fade'
                      ? 'animate-fade-out'
                      : ''
                }`}
                draggable={false}
              />
            )}

            {/* Hotspot pins */}
            {steps.map((step, idx) => {
              if (step.imageIndex !== currentImageIndex) return null;
              const isActive = activeStepId === step.id;
              // Per-step "Always hidden" — never render the marker. The
              // legacy `hideStepNumber` flag is read as a fallback so old
              // sets keep working without migration.
              const alwaysHidden = Boolean(
                step.hotspotAlwaysHidden ?? step.hideStepNumber
              );
              if (alwaysHidden) return null;
              // Auto-hide-while-live: the active step's marker disappears
              // in any mode so it doesn't sit on top of the
              // popover/tooltip/spotlight content it just opened. Other
              // pins on the same image stay visible so explore-mode users
              // can still click them. The interaction overlay (tooltip
              // arrow, spotlight focus, popover position) is still
              // anchored to the pin's coordinates even with the marker
              // hidden, so users keep their visual anchor.
              if (isActive) return null;
              // Structured/guided only render the *current* step's pin
              // (other steps are sequenced through Prev/Next, not clickable
              // out of order). Since the current step is also the active
              // one in those modes, this branch effectively renders no
              // pin during a live structured/guided step — the user sees
              // only the interaction overlay. Explore mode renders every
              // non-active pin on the image.
              const isCurrentStructured =
                mode !== 'explore' && step.id === currentStep?.id;
              const showPin = mode === 'explore' || isCurrentStructured;
              if (!showPin) return null;

              const position = toContainerCoords(
                step.xPct,
                step.yPct,
                imgOffset
              );

              return (
                <div
                  key={step.id}
                  className="absolute z-10"
                  style={{
                    left: `${position.xPct}%`,
                    top: `${position.yPct}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <button
                    onClick={() => handlePinClick(step)}
                    className={`group relative flex items-center justify-center rounded-full border-2 border-white transition-all shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/90 bg-white/25 hover:bg-white/35 ${
                      // 'reminder' wiggle is applied to the button itself
                      // (not a ring child) so it actually moves the marker.
                      // 'consistent' uses the inline ping ring below.
                      // 'off' adds nothing.
                      pulseMode === 'reminder'
                        ? 'animate-gl-pulse-reminder motion-reduce:animate-none'
                        : ''
                    }`}
                    style={{
                      width: 'min(32px, 8cqmin)',
                      height: 'min(32px, 8cqmin)',
                    }}
                    aria-label={step.label ?? `Step ${idx + 1}`}
                  >
                    {pulseMode === 'consistent' && (
                      <span className="pointer-events-none absolute inset-0 rounded-full border border-white/70 animate-ping opacity-70 motion-reduce:hidden [animation-duration:2s]" />
                    )}
                    <span
                      className="pointer-events-none absolute rounded-full bg-white/95"
                      style={{
                        width: 'min(7px, 1.8cqmin)',
                        height: 'min(7px, 1.8cqmin)',
                      }}
                    />
                    <span
                      className="relative text-white font-bold select-none"
                      style={{ fontSize: 'min(12px, 3cqmin)' }}
                    >
                      {idx + 1}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {mode === 'structured' && steps.length > 0 && (
            <>
              <button
                onClick={goPrev}
                disabled={currentIdx === 0}
                aria-label="Previous step"
                className="absolute top-1/2 -translate-y-1/2 z-30 rounded-full bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 disabled:opacity-40 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
                style={{
                  left: 'clamp(8px, 2cqmin, 12px)',
                  width: 'clamp(36px, 7cqmin, 56px)',
                  height: 'clamp(36px, 7cqmin, 56px)',
                }}
              >
                <ChevronLeft
                  className="mx-auto text-white"
                  style={{
                    width: 'clamp(18px, 4cqmin, 32px)',
                    height: 'clamp(18px, 4cqmin, 32px)',
                  }}
                />
              </button>
              <button
                onClick={goNext}
                disabled={currentIdx === steps.length - 1}
                aria-label="Next step"
                className="absolute top-1/2 -translate-y-1/2 z-30 rounded-full bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 disabled:opacity-40 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
                style={{
                  right: 'clamp(8px, 2cqmin, 12px)',
                  width: 'clamp(36px, 7cqmin, 56px)',
                  height: 'clamp(36px, 7cqmin, 56px)',
                }}
              >
                <ChevronRight
                  className="mx-auto text-white"
                  style={{
                    width: 'clamp(18px, 4cqmin, 32px)',
                    height: 'clamp(18px, 4cqmin, 32px)',
                  }}
                />
              </button>
            </>
          )}

          {/* Interaction overlays */}
          {renderInteraction()}
        </div>
      </div>

      {/* Step indicator dots for structured/guided */}
      {mode !== 'explore' && steps.length > 1 && steps.length <= 20 && (
        <div
          className="flex items-center justify-center flex-shrink-0 bg-slate-900/50"
          style={{ gap: 'min(4px, 1cqmin)', padding: 'min(8px, 2cqmin) 0' }}
        >
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => {
                setCurrentIdx(i);
                setActiveStepId(s.id);
              }}
              className={`rounded-full transition-all ${
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
            />
          ))}
        </div>
      )}
    </div>
  );
};
