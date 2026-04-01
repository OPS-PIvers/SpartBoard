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
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1 for guided auto-advance
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [answeredSteps, setAnsweredSteps] = useState<Set<string>>(new Set());

  // Track previous mode to reset step index when mode changes (adjusting state while rendering)
  const [prevMode, setPrevMode] = useState(mode);
  if (prevMode !== mode) {
    setPrevMode(mode);
    if (mode !== 'explore' && steps.length > 0) {
      setCurrentIdx(0);
      setActiveStepId(steps[0].id);
    }
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);

  const [imgOffset, setImgOffset] = useState<{
    left: number;
    top: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);

  const measureImg = useCallback(() => {
    if (!imgRef.current || !containerRef.current) {
      setImgOffset(null);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const footprint = calculateImageFootprint(
      imgRef.current.naturalWidth,
      imgRef.current.naturalHeight,
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
  const panZoomActive =
    currentStep?.interactionType === 'pan-zoom' ? currentStep.id : null;

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
        // Don't auto-advance if it's a question that hasn't been answered
        if (
          currentStep?.interactionType === 'question' &&
          currentStep.id &&
          !answeredSteps.has(currentStep.id)
        ) {
          return;
        }
        goNext();
      }
    }, interval);
  }, [currentStep, answeredSteps, goNext]);

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

  const handlePinClick = (step: GuidedLearningPublicStep) => {
    if (mode === 'explore') {
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
      transition: 'transform 0.6s ease-in-out',
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

    if (type === 'spotlight' && activeStepInContainer) {
      return (
        <SpotlightInteraction
          step={activeStepInContainer}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
        />
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

    return null;
  };

  // Tooltip — rendered separately (not in overlay, directly on canvas)
  const renderTooltip = () => {
    if (
      !activeStepInContainer ||
      activeStepInContainer.interactionType !== 'tooltip'
    ) {
      return null;
    }

    return (
      <TooltipInteraction
        step={activeStepInContainer}
        containerWidth={containerSize.w}
        containerHeight={containerSize.h}
      />
    );
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
            <button
              onClick={goPrev}
              disabled={currentIdx === 0}
              className="text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft
                style={{
                  width: 'min(20px, 5cqmin)',
                  height: 'min(20px, 5cqmin)',
                }}
              />
            </button>
            <span
              className="text-slate-300 font-bold"
              style={{ fontSize: 'min(11px, 3cqmin)' }}
            >
              {currentIdx + 1} / {steps.length}
            </span>
            <button
              onClick={goNext}
              disabled={currentIdx === steps.length - 1}
              className="text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
              aria-label="Next"
            >
              <ChevronRight
                style={{
                  width: 'min(20px, 5cqmin)',
                  height: 'min(20px, 5cqmin)',
                }}
              />
            </button>
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
          <span
            className="text-slate-400 font-medium"
            style={{ fontSize: 'min(11px, 3cqmin)' }}
          >
            Click any pin to explore
          </span>
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
        >
          {/* Image with optional pan-zoom transform */}
          <div className="w-full h-full relative" style={getPanZoomStyle()}>
            {set.imageUrl && (
              <img
                ref={imgRef}
                src={set.imageUrl}
                alt={set.title}
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
                onLoad={measureImg}
              />
            )}

            {/* Hotspot pins */}
            {steps.map((step, idx) => {
              const isActive = activeStepId === step.id;
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
                    className={`relative flex items-center justify-center rounded-full border-2 border-white transition-all shadow-lg focus:outline-none ${
                      isActive
                        ? 'bg-indigo-600 scale-125 shadow-indigo-500/60'
                        : 'bg-white/20 hover:bg-white/30 animate-pulse'
                    }`}
                    style={{
                      width: 'min(32px, 8cqmin)',
                      height: 'min(32px, 8cqmin)',
                    }}
                    aria-label={step.label ?? `Step ${idx + 1}`}
                  >
                    <span
                      className="text-white font-bold select-none"
                      style={{ fontSize: 'min(12px, 3cqmin)' }}
                    >
                      {idx + 1}
                    </span>
                  </button>
                </div>
              );
            })}

            {/* Tooltip (rendered inline with image) */}
            {renderTooltip()}
          </div>

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
                  i === currentIdx ? 'min(16px, 4cqmin)' : 'min(8px, 2cqmin)',
                height: 'min(8px, 2cqmin)',
              }}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
