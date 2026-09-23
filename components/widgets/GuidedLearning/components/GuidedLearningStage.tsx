import React, {
  useState,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useCallback,
} from 'react';
import { Minimize2 } from 'lucide-react';
import type {
  GuidedLearningPublicStep,
  GuidedLearningVideoTrim,
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
  computePanZoomTranslate,
  toContainerCoords,
  toContainerSpotlightRadiusPct,
  toImageOffset,
  type ImageOffset,
} from '../utils/imageUtils';
import { isGuidedLearningSetV2 } from '../utils/setMigration';
import { buildStageGeometry } from '../utils/stageGeometry';
import { pointInRegion, regionRect } from '../utils/regionGeometry';
import { placeBanner } from '../utils/calloutPlacement';
import {
  CALLOUT_IN_MS,
  SLIDE_MS,
  ZOOM_EASE,
  ZOOM_MS,
  cursorMs,
  motionMs,
} from '../utils/motion';
import { AnimatedCursor } from './player/AnimatedCursor';
import type {
  GuidedLearningStageProps,
  PctPoint,
  PxRect,
  StageGeometry,
} from '../types/stage';

/**
 * Clamp a video trim against the player's loaded metadata. The editor already
 * enforces `0 <= start < end <= duration`, but a stale doc / manual edit could
 * carry out-of-range values; clamping keeps seeking sane. When the duration
 * isn't known yet (`NaN`/0 — e.g. before metadata loads, or in jsdom), the
 * raw trim values are trusted since there's nothing valid to clamp against.
 *
 * A corrupted doc could also carry a non-finite `start`/`end` (`NaN`/`undefined`
 * from a type mismatch). Assigning `NaN` to `video.currentTime` throws in most
 * browsers, so both ends are sanitized to a finite fallback first.
 */
function clampTrimStart(
  trim: GuidedLearningVideoTrim,
  duration: number
): number {
  const rawStart = Number.isFinite(trim.start) ? trim.start : 0;
  const start = Math.max(0, rawStart);
  return Number.isFinite(duration) && duration > 0
    ? Math.min(start, duration)
    : start;
}

function clampTrimEnd(trim: GuidedLearningVideoTrim, duration: number): number {
  const hasDuration = Number.isFinite(duration) && duration > 0;
  const rawEnd = Number.isFinite(trim.end)
    ? trim.end
    : hasDuration
      ? duration
      : 0;
  return hasDuration ? Math.min(rawEnd, duration) : rawEnd;
}

type RenderedTransform = StageGeometry['renderedTransform'];

/** A Watch demo glide or Try hint; points are image-%, `from` null = frame centre. */
export interface StageCursorCue {
  key: string;
  from: PctPoint | null;
  to: PctPoint;
  ripple: boolean;
  onDone?: () => void;
}

/** Smallest Try hit target for a step with no drawn region, in px. */
const MIN_PIN_HIT_PX = 44;

/** Player-only additions; the Studio renders with the frozen props alone. */
export interface GuidedLearningStageRuntimeProps {
  /** The sequenced step in structured/guided mode, kept while its overlay is dismissed. Defaults to activeStepId. */
  currentStepId?: string | null;
  /** Renders the v2 "Reset view" button and handles it. */
  onResetZoom?: () => void;
  /** Player v2 calm motion at this learner speed; absent keeps today's timings. */
  motionSpeed?: number;
  cursor?: StageCursorCue | null;
  /** Try mode: a stage click outside any callout, tested against the current step. */
  onTargetClick?: (hit: boolean, at: PctPoint) => void;
  /** Each increase shakes the callout once (a Try misclick). */
  misclickCount?: number;
  /** Player v2: dialogs take focus and hand it back, and the image alt names the step. */
  accessibleOverlays?: boolean;
}

export const GuidedLearningStage: React.FC<
  GuidedLearningStageProps & GuidedLearningStageRuntimeProps
> = ({
  set,
  steps,
  imageIndex: currentImageIndex,
  activeStepId,
  authorMode: mode,
  teacherMode,
  zoomScale,
  renderEditLayer,
  onGeometry,
  onPinClick,
  onAnswer,
  onAdvance,
  onDismiss,
  currentStepId,
  onResetZoom,
  motionSpeed,
  cursor,
  onTargetClick,
  misclickCount = 0,
  accessibleOverlays = false,
}) => {
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
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    )
      return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  const calmMotion = motionSpeed !== undefined;
  const motionOpts = {
    speed: motionSpeed ?? 1,
    reducedMotion: prefersReducedMotion,
  };
  const zoomMs = calmMotion
    ? motionMs(ZOOM_MS, motionOpts)
    : prefersReducedMotion
      ? 0
      : 600;
  const slideMs = calmMotion ? motionMs(SLIDE_MS, motionOpts) : 500;
  const calloutInMs = calmMotion ? motionMs(CALLOUT_IN_MS, motionOpts) : 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  // The mounted media element as state, so pointer maths never reads a ref during render.
  const [mediaEl, setMediaEl] = useState<
    HTMLImageElement | HTMLVideoElement | null
  >(null);
  // Bumps on every media swap so onGeometry re-fires with the new element.
  const [mediaVersion, setMediaVersion] = useState(0);
  const attachImg = useCallback((el: HTMLImageElement | null) => {
    imgRef.current = el;
    setMediaEl(el ?? videoElRef.current);
    if (el) setMediaVersion((v) => v + 1);
  }, []);
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    setMediaEl(el ?? imgRef.current);
    if (el) setMediaVersion((v) => v + 1);
  }, []);

  const [imgOffset, setImgOffset] = useState<ImageOffset | null>(null);

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

  const schemaV2 = isGuidedLearningSetV2(set);

  const sequencedStepId =
    currentStepId === undefined ? activeStepId : currentStepId;
  const currentStep = steps.find((s) => s.id === sequencedStepId) ?? null;
  const activeStep = steps.find((s) => s.id === activeStepId) ?? null;
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
  // cleanup effect below drops the previous layer once its animation
  // has finished.
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
    const id = setTimeout(() => setPrevImageIndex(null), slideMs);
    return () => clearTimeout(id);
  }, [prevImageIndex, slideMs]);
  // Skip the exit layer when the previous slide was a video — an <img>
  // can't render a video URL, so the transition falls back to an instant
  // swap for that case.
  const previousImageUrl =
    prevImageIndex !== null &&
    (set.imageKinds?.[prevImageIndex] ?? 'image') !== 'video'
      ? (set.imageUrls[prevImageIndex] ?? null)
      : null;

  // Re-measure whenever the slide changes — the <img> src is mutated in
  // place, so cached images can swap without firing onLoad.
  useEffect(() => {
    // DOM measurement after commit; it cannot be computed during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measureImg();
  }, [measureImg, currentImageUrl, currentImageIndex]);

  const toContainerStep = useCallback(
    (step: GuidedLearningPublicStep | null) => {
      if (!step) return null;
      const coords = toContainerCoords(step.xPct, step.yPct, imgOffset);
      if (!coords) return null;
      return { ...step, ...coords };
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
      // Decode ahead of time so a slide swap paints immediately.
      void image.decode?.().catch(() => undefined);
    });
  }, [set.imageUrls, set.imageKinds]);

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

  // Single source of truth for the transform the pan-zoom layer renders.
  const renderedTransform = ((): RenderedTransform => {
    const identity = { scale: 1, tx: 0, ty: 0 };
    if (containerSize.w === 0) return identity;
    // Legacy sets (schemaVersion absent/1): per-step zoom reset, now animated.
    const scale = schemaV2
      ? zoomScale
      : panZoomActive
        ? (steps.find((s) => s.id === panZoomActive)?.panZoomScale ?? 2.5)
        : 1;
    if (scale <= 1) return identity;
    const target = toContainerStep(
      schemaV2
        ? panZoomTargetStep
        : (steps.find((s) => s.id === panZoomActive) ?? null)
    );
    if (!target) return identity;
    const { tx, ty } = computePanZoomTranslate(
      target.xPct,
      target.yPct,
      scale,
      containerSize.w,
      containerSize.h
    );
    return { scale, tx, ty };
  })();

  // Calm motion: callouts wait for the camera to settle on the new transform.
  const transformKey = `${renderedTransform.scale}|${renderedTransform.tx}|${renderedTransform.ty}`;
  const [settledKey, setSettledKey] = useState(transformKey);
  const waitsForCamera = calmMotion && zoomMs > 0;
  if (!waitsForCamera && settledKey !== transformKey) {
    setSettledKey(transformKey);
  }
  const cameraMoving = waitsForCamera && settledKey !== transformKey;
  useEffect(() => {
    if (!cameraMoving) return;
    // transitionend is the normal signal; this covers a transition that never fires.
    const id = setTimeout(() => setSettledKey(transformKey), zoomMs + 80);
    return () => clearTimeout(id);
  }, [cameraMoving, transformKey, zoomMs]);

  // Map container-% coords through the rendered transform so overlays always
  // anchor where the hotspot is actually painted.
  const toRenderedCoords = (coords: { xPct: number; yPct: number }) => {
    const { scale, tx, ty } = renderedTransform;
    if (scale <= 1) return coords;
    return {
      xPct:
        coords.xPct * scale +
        (containerSize.w ? (tx / containerSize.w) * 100 : 0),
      yPct:
        coords.yPct * scale +
        (containerSize.h ? (ty / containerSize.h) * 100 : 0),
    };
  };

  const activeStepRendered = activeStepInContainer
    ? { ...activeStepInContainer, ...toRenderedCoords(activeStepInContainer) }
    : null;

  const geometry: StageGeometry | null =
    imgOffset && containerSize.w > 0 && containerSize.h > 0
      ? buildStageGeometry({
          containerSize,
          imgOffset,
          renderedTransform,
          getMediaRect: () => mediaEl?.getBoundingClientRect() ?? null,
        })
      : null;
  // Primitive signature so onGeometry fires on layout changes, not every render.
  const geometryKey = geometry
    ? [
        containerSize.w,
        containerSize.h,
        imgOffset?.left,
        imgOffset?.top,
        imgOffset?.scaleX,
        imgOffset?.scaleY,
        renderedTransform.scale,
        renderedTransform.tx,
        renderedTransform.ty,
        mediaVersion,
      ].join('|')
    : null;
  const emitGeometry = useEffectEvent(() => {
    if (geometry) onGeometry?.(geometry);
  });
  useEffect(() => {
    if (geometryKey) emitGeometry();
  }, [geometryKey]);

  // Calculate pan-zoom transform
  const getPanZoomStyle = (): React.CSSProperties => {
    if (containerSize.w === 0) return {};
    const transition =
      zoomMs === 0
        ? 'none'
        : calmMotion
          ? `transform ${zoomMs}ms ${ZOOM_EASE}`
          : 'transform 0.6s ease-in-out';
    const { scale, tx, ty } = renderedTransform;
    // Identity keeps transition + transform so zoom-out animates instead of snapping.
    if (scale <= 1) {
      return {
        transform: 'scale(1) translate(0px, 0px)',
        transition,
        transformOrigin: '0 0',
      };
    }
    return {
      transform: `scale(${scale}) translate(${tx / scale}px, ${ty / scale}px)`,
      transition,
      transformOrigin: '0 0',
    };
  };

  // Drawn region of the active step, in painted container px.
  const activeRegion =
    activeStep?.region && geometry ? geometry.regionFor(activeStep) : null;
  const pinnedCallout =
    activeStep?.calloutPin && geometry
      ? geometry.imagePctToContainerPx(activeStep.calloutPin)
      : undefined;
  // What a callout must keep clear: the region, else the lit circle, else the pin.
  const calloutTarget = (spotlightPx?: number): PxRect | undefined => {
    if (!activeStep || !geometry) return undefined;
    if (activeRegion) return regionRect(activeRegion);
    if (spotlightPx !== undefined && activeStepRendered) {
      const cx = (activeStepRendered.xPct / 100) * containerSize.w;
      const cy = (activeStepRendered.yPct / 100) * containerSize.h;
      return {
        x: cx - spotlightPx,
        y: cy - spotlightPx,
        w: spotlightPx * 2,
        h: spotlightPx * 2,
      };
    }
    return regionRect(geometry.regionFor(activeStep));
  };

  // Try misclick: a short shake on the callout, via the Web Animations API.
  useEffect(() => {
    if (misclickCount === 0 || prefersReducedMotion) return;
    const root = containerRef.current;
    root?.querySelectorAll('[data-gl-callout]').forEach((el) => {
      el.animate?.(
        [
          { translate: '0 0' },
          { translate: '-5px 0' },
          { translate: '5px 0' },
          { translate: '0 0' },
        ],
        { duration: 150, easing: 'ease-in-out' }
      );
    });
  }, [misclickCount, prefersReducedMotion]);

  // Try success pulse at the click point, in container px.
  const [pulse, setPulse] = useState<{
    x: number;
    y: number;
    n: number;
  } | null>(null);
  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onTargetClick || !geometry || !currentStep) return;
    const el = e.target as Element;
    if (
      el.closest(
        '[data-gl-callout], button, a, input, textarea, select, video, audio'
      )
    ) {
      return;
    }
    const at = geometry.clientToImagePct(e.clientX, e.clientY);
    const px = geometry.imagePctToContainerPx(at);
    const region = geometry.regionFor(currentStep);
    const hitRegion =
      region.shape === 'pin'
        ? {
            ...region,
            w: Math.max(region.w, MIN_PIN_HIT_PX),
            h: Math.max(region.h, MIN_PIN_HIT_PX),
          }
        : region;
    const hit = pointInRegion(px, hitRegion);
    if (hit && !prefersReducedMotion) {
      setPulse((prev) => ({ x: px.x, y: px.y, n: (prev?.n ?? 0) + 1 }));
    }
    onTargetClick(hit, at);
  };

  // Popover, question, audio and video overlays are dialogs named by the step.
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogTitleId = useId();
  const dialogTitle = (
    <span id={dialogTitleId} hidden>
      {activeStep?.label ?? set.title}
    </span>
  );
  const focusVisibleDialog = useEffectEvent(() => {
    const el = dialogRef.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, video[controls], [tabindex]:not([tabindex="-1"])'
    );
    first?.focus({ preventScroll: true });
  });
  useEffect(() => {
    if (!accessibleOverlays || !activeStepId || cameraMoving) return;
    focusVisibleDialog();
  }, [accessibleOverlays, activeStepId, cameraMoving]);
  // Closing or finishing an overlay hands focus back to the stage, if it was inside.
  const returnFocus = () => {
    const root = containerRef.current;
    const focused = document.activeElement;
    if (
      accessibleOverlays &&
      root &&
      focused &&
      focused !== root &&
      root.contains(focused)
    ) {
      root.focus({ preventScroll: true });
    }
  };
  const dismiss = () => {
    returnFocus();
    onDismiss();
  };
  const advance = () => {
    returnFocus();
    onAdvance();
  };

  const renderPopover = (spotlightPx?: number) =>
    activeStep ? (
      <div
        ref={dialogRef}
        role="dialog"
        aria-labelledby={dialogTitleId}
        className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center"
      >
        {dialogTitle}
        <div className="pointer-events-auto w-full h-full">
          <TextPopoverInteraction
            step={activeStep}
            onClose={dismiss}
            target={calloutTarget(spotlightPx)}
            pinned={pinnedCallout}
            containerWidth={containerSize.w}
            containerHeight={containerSize.h}
          />
        </div>
      </div>
    ) : null;

  const renderInteraction = () => {
    if (!activeStep) return null;
    const type = activeStep.interactionType;

    if (type === 'text-popover') {
      return renderPopover();
    }

    if (type === 'audio') {
      return (
        <div
          ref={dialogRef}
          role="dialog"
          aria-labelledby={dialogTitleId}
          className="absolute inset-0 z-30 pointer-events-none flex items-end justify-center pb-4"
        >
          {dialogTitle}
          <div className="pointer-events-auto">
            <AudioInteraction step={activeStep} autoPlay onEnded={advance} />
          </div>
        </div>
      );
    }

    if (type === 'video') {
      return (
        <div
          ref={dialogRef}
          role="dialog"
          aria-labelledby={dialogTitleId}
          className="absolute inset-0 z-30 pointer-events-auto"
        >
          {dialogTitle}
          <VideoInteraction
            step={activeStep}
            onClose={dismiss}
            onEnded={advance}
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
        <div
          ref={dialogRef}
          role="dialog"
          aria-labelledby={dialogTitleId}
          className="absolute inset-0 z-30 pointer-events-auto overflow-hidden"
        >
          {dialogTitle}
          <QuestionInteraction
            step={activeStep}
            onAnswer={(answer, isCorrect) =>
              onAnswer?.(activeStep.id, answer, isCorrect)
            }
            onContinue={advance}
            correctAnswer={origStep?.question?.correctAnswer}
            correctMatchingPairs={origStep?.question?.matchingPairs}
            correctSortingItems={origStep?.question?.sortingItems}
            studentMode={!teacherMode}
          />
        </div>
      );
    }

    if (type === 'tooltip') {
      return activeStepRendered ? (
        <TooltipInteraction
          key={activeStepRendered.id}
          step={activeStepRendered}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
          target={calloutTarget()}
          pinned={pinnedCallout}
          showAnchor={!activeRegion}
        />
      ) : null;
    }

    if (
      type === 'pan-zoom' ||
      type === 'spotlight' ||
      type === 'pan-zoom-spotlight'
    ) {
      const renderOverlay = (spotlightPx?: number) => {
        const target = calloutTarget(spotlightPx);
        if (activeStep.showOverlay === 'tooltip' && activeStepRendered) {
          return (
            <TooltipInteraction
              key={activeStepRendered.id}
              step={activeStepRendered}
              containerWidth={containerSize.w}
              containerHeight={containerSize.h}
              target={target}
              pinned={pinnedCallout}
              showAnchor={!activeRegion}
            />
          );
        }
        if (activeStep.showOverlay === 'popover') {
          return renderPopover(spotlightPx);
        }
        if (activeStep.showOverlay === 'banner') {
          return (
            <BannerInteraction
              step={activeStep}
              onClose={dismiss}
              position={
                target
                  ? placeBanner(target, {
                      w: containerSize.w,
                      h: containerSize.h,
                    })
                  : 'top'
              }
            />
          );
        }
        return null;
      };

      if (
        (type === 'spotlight' || type === 'pan-zoom-spotlight') &&
        activeStepRendered
      ) {
        // v2 sets: spotlightRadius is image-relative — convert to container-%
        // and scale by the rendered zoom so the circle tracks what's visible.
        const spotlightStep = schemaV2
          ? {
              ...activeStepRendered,
              spotlightRadius:
                toContainerSpotlightRadiusPct(
                  activeStepRendered.spotlightRadius ?? 25,
                  imgOffset,
                  containerSize.w,
                  containerSize.h
                ) * renderedTransform.scale,
            }
          : activeStepRendered;
        // Keep callouts outside the lit circle so they never cover the target.
        const spotlightPx =
          (Math.min(containerSize.w, containerSize.h) *
            (spotlightStep.spotlightRadius ?? 25)) /
          100;
        return (
          <>
            <SpotlightInteraction
              step={spotlightStep}
              containerWidth={containerSize.w}
              containerHeight={containerSize.h}
              region={activeRegion ?? undefined}
            />
            {renderOverlay(spotlightPx)}
          </>
        );
      }

      return renderOverlay();
    }

    return null;
  };

  return (
    <div
      ref={containerRef}
      data-gl-stage=""
      className="w-full h-full relative flex items-center justify-center"
      tabIndex={0}
      onClick={onTargetClick ? handleStageClick : undefined}
    >
      {/* Image with optional pan-zoom transform */}
      <div
        data-testid="gl-panzoom-layer"
        className="w-full h-full relative motion-reduce:transition-none"
        style={getPanZoomStyle()}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === 'transform') {
            setSettledKey(transformKey);
          }
        }}
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
            ref={attachVideo}
            src={currentImageUrl}
            muted
            loop
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            onLoadedMetadata={(e) => {
              measureImg();
              if (slideTrim) {
                const el = e.currentTarget;
                el.currentTime = clampTrimStart(slideTrim, el.duration);
              }
            }}
            onTimeUpdate={(e) => {
              // Loop within the trimmed playback range. The native
              // `loop` attribute still covers the untrimmed case (and
              // acts as a fallback if `end` is at/after the file end).
              if (!slideTrim) return;
              const el = e.currentTarget;
              // Clamp the trim against the loaded metadata — a stale doc,
              // manual edit, or future UI bug could carry out-of-range
              // values that would otherwise wedge seeking. No-op on a
              // degenerate range so native `loop` takes over.
              const start = clampTrimStart(slideTrim, el.duration);
              const end = clampTrimEnd(slideTrim, el.duration);
              if (end <= start) return;
              if (el.currentTime >= end || el.currentTime < start - 0.25) {
                el.currentTime = start;
              }
            }}
          />
        )}
        {currentImageUrl && slideKind !== 'video' && (
          <img
            ref={attachImg}
            src={currentImageUrl}
            alt={
              accessibleOverlays && currentStep?.label
                ? currentStep.label
                : set.title
            }
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            draggable={false}
            onLoad={measureImg}
          />
        )}
        {/* Previous image — only mounted while a transition is in
            flight. Rendered ABOVE the current layer (later in DOM
            order, so it paints on top) and animates OUT, revealing
            the current image underneath. The cleanup effect drops
            this layer once the slide time has passed. */}
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
            style={
              calmMotion ? { animationDuration: `${slideMs}ms` } : undefined
            }
            draggable={false}
          />
        )}

        {/* Explore click zones for drawn regions, under the pins. Hidden
            hotspots keep their zone so "find it yourself" steps stay clickable. */}
        {mode === 'explore' &&
          imgOffset &&
          steps.map((step, idx) => {
            const region = step.region;
            if (!region || step.imageIndex !== currentImageIndex) return null;
            if (activeStepId === step.id) return null;
            const hidden = Boolean(
              step.hotspotAlwaysHidden ?? step.hideStepNumber
            );
            const wPx =
              (region.wPct / 100) * containerSize.w * imgOffset.scaleX;
            const hPx =
              (region.hPct / 100) * containerSize.h * imgOffset.scaleY;
            const left = step.xPct - region.wPct / 2;
            const top = step.yPct - region.hPct / 2;
            let shapeStyle: React.CSSProperties;
            if (region.shape === 'ellipse') {
              shapeStyle = { borderRadius: '50%' };
            } else if (region.shape === 'polygon' && region.points) {
              const pts = region.points
                .map(
                  (p) =>
                    `${((p.x - left) / region.wPct) * 100}% ${((p.y - top) / region.hPct) * 100}%`
                )
                .join(', ');
              shapeStyle = { clipPath: `polygon(${pts})` };
            } else {
              const corner = Math.min(Math.max(region.cornerPct ?? 0, 0), 50);
              shapeStyle = {
                borderRadius: (corner / 100) * Math.min(wPx, hPx),
              };
            }
            return (
              <button
                key={`region-${step.id}`}
                type="button"
                data-gl-region={step.id}
                onClick={() => onPinClick(step.id)}
                aria-label={step.label ?? `Step ${idx + 1}`}
                className={`absolute z-[5] bg-transparent transition-colors focus:outline-none focus-visible:bg-white/20 ${
                  hidden
                    ? ''
                    : region.shape === 'polygon'
                      ? 'hover:bg-white/15'
                      : 'hover:bg-white/15 hover:ring-2 hover:ring-white/70'
                }`}
                style={{
                  left: `${imgOffset.left + left * imgOffset.scaleX}%`,
                  top: `${imgOffset.top + top * imgOffset.scaleY}%`,
                  width: `${region.wPct * imgOffset.scaleX}%`,
                  height: `${region.hPct * imgOffset.scaleY}%`,
                  ...shapeStyle,
                }}
              />
            );
          })}

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
          // A cursor glide stands in for the pin until the step is shown.
          const showPin =
            mode === 'explore' || (isCurrentStructured && !cursor);
          if (!showPin) return null;

          const position = toContainerCoords(step.xPct, step.yPct, imgOffset);
          // Don't place pins until the image footprint is measured.
          if (!position) return null;

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
                onClick={() => onPinClick(step.id)}
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

      {/* Reset view — v2 sets only, shown only while a non-identity zoom
          is actually rendered. Gated on the rendered transform (not raw
          zoomScale) because zoomScale can stay >1 after a mode switch
          (e.g. structured -> explore) even though renderedTransform
          resolves to identity once there's no target step to focus —
          checking the raw value would leave a stray button over an
          unzoomed view. z-40 keeps it above all interaction overlays
          (Banner included), which top out at z-30. */}
      {schemaV2 && renderedTransform.scale > 1 && onResetZoom && (
        <button
          onClick={onResetZoom}
          aria-label="Reset view"
          className="absolute left-1/2 -translate-x-1/2 z-40 rounded-full bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
          style={{
            top: 'clamp(8px, 2cqmin, 12px)',
            width: 'clamp(36px, 7cqmin, 56px)',
            height: 'clamp(36px, 7cqmin, 56px)',
          }}
        >
          <Minimize2
            className="mx-auto text-white"
            style={{
              width: 'clamp(16px, 4cqmin, 28px)',
              height: 'clamp(16px, 4cqmin, 28px)',
            }}
          />
        </button>
      )}

      {/* Interaction overlays; calm motion holds them hidden until the camera settles. */}
      {calmMotion ? (
        <div
          key={activeStepId ?? 'none'}
          data-testid="gl-callout-layer"
          data-camera={cameraMoving ? 'moving' : 'settled'}
          className="absolute inset-0 pointer-events-none"
          style={
            cameraMoving
              ? { visibility: 'hidden', opacity: 0 }
              : calloutInMs > 0
                ? {
                    animation: `gl-callout-in ${calloutInMs}ms ${ZOOM_EASE} both`,
                  }
                : undefined
          }
        >
          {renderInteraction()}
        </div>
      ) : (
        renderInteraction()
      )}

      {cursor &&
        geometry &&
        (() => {
          const to = geometry.imagePctToContainerPx(cursor.to);
          const from = cursor.from
            ? geometry.imagePctToContainerPx(cursor.from)
            : { x: containerSize.w / 2, y: containerSize.h / 2 };
          return (
            <AnimatedCursor
              key={cursor.key}
              from={from}
              to={to}
              durationMs={cursorMs(
                Math.hypot(to.x - from.x, to.y - from.y),
                motionOpts
              )}
              ripple={cursor.ripple}
              onDone={cursor.onDone}
            />
          );
        })()}

      {pulse && (
        <span
          key={pulse.n}
          data-testid="gl-success-pulse"
          aria-hidden="true"
          className="absolute z-40 pointer-events-none rounded-full border-2 border-emerald-300"
          style={{
            left: pulse.x,
            top: pulse.y,
            width: 'min(48px, 10cqmin)',
            height: 'min(48px, 10cqmin)',
            marginLeft: 'calc(min(48px, 10cqmin) / -2)',
            marginTop: 'calc(min(48px, 10cqmin) / -2)',
            animation: 'gl-ripple 420ms ease-out both',
          }}
          onAnimationEnd={() => setPulse(null)}
        />
      )}

      {/* Studio edit layer: above every overlay; children opt into pointer events. */}
      {geometry && renderEditLayer && (
        <div className="absolute inset-0 z-50 pointer-events-none">
          {renderEditLayer(geometry)}
        </div>
      )}
    </div>
  );
};
