import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import {
  Upload,
  ImageIcon,
  Loader2,
  Plus,
  Clipboard,
  ChevronUp,
  ChevronDown,
  Trash2,
  MousePointerClick,
  Activity,
  ArrowLeftRight,
  Film,
  Scissors,
} from 'lucide-react';
import { GuidedLearningStep } from '@/types';
import { SortableList } from '@/components/common/SortableList';
import { GL_MEDIA_ACCEPT } from '@/utils/guidedLearningMedia';
import { GuidedLearningStepEditor } from './GuidedLearningStepEditor';
import { ScreenCaptureModal, type CaptureMode } from './ScreenCaptureModal';
import { SpotlightInteraction } from './interactions/SpotlightInteraction';
import {
  calculateImageFootprint,
  computeZoomExtentRect,
  toContainerCoords,
  toContainerSpotlightRadiusPct,
  toImageOffset,
} from '../utils/imageUtils';
import type { GuidedLearningEditorController } from './useGuidedLearningEditorState';
import { SettingChip } from './editorShared/SettingChip';
import { WelcomeChip } from './editorShared/WelcomeChip';
import { CaptureMenuButton } from './editorShared/CaptureMenuButton';
import { VideoTrimBar } from './editorShared/VideoTrimBar';
import {
  MODE_OPTIONS,
  PULSE_OPTIONS,
  TRANSITION_OPTIONS,
} from './editorShared/setOptions';

// ─── Context pane ────────────────────────────────────────────────────────────

interface PaneProps {
  state: GuidedLearningEditorController;
}

/**
 * Slice comparator for the context pane. The controller object from
 * `useGuidedLearningEditorState` is rebuilt on every render (and the modal
 * hosts the hook, so it re-renders on every editor state change), so the
 * pane memoizes on the slices it actually consumes. The setters / step callbacks it uses are
 * referentially stable. The upload callbacks are intentionally NOT compared:
 * `useStorage` returns fresh function identities on every render, so they
 * never compare equal, but they are functionally equivalent for the
 * lifetime of the signed-in session — comparing them would defeat the memo
 * entirely. If the pane starts consuming a new controller field, add it
 * here or the pane will render stale data.
 */
const glContextPanePropsEqual = (prev: PaneProps, next: PaneProps): boolean =>
  prev.state.description === next.state.description &&
  prev.state.mode === next.state.mode &&
  prev.state.hotspotPulse === next.state.hotspotPulse &&
  prev.state.imageTransition === next.state.imageTransition &&
  prev.state.welcomeEnabled === next.state.welcomeEnabled &&
  prev.state.welcomeMessage === next.state.welcomeMessage &&
  prev.state.imageUrls === next.state.imageUrls &&
  prev.state.imageKinds === next.state.imageKinds &&
  prev.state.videoTrims === next.state.videoTrims &&
  prev.state.currentImageIndex === next.state.currentImageIndex &&
  prev.state.uploading === next.state.uploading &&
  prev.state.uploadProgress === next.state.uploadProgress &&
  prev.state.imageError === next.state.imageError &&
  prev.state.addingStep === next.state.addingStep &&
  prev.state.selectedStepId === next.state.selectedStepId &&
  prev.state.steps === next.state.steps &&
  prev.state.spotlightRadiiV2 === next.state.spotlightRadiiV2;

export const GuidedLearningEditorContextPane = React.memo(
  function GuidedLearningEditorContextPane({ state }: PaneProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageContainerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Title + folder are owned by the modal shell now (editable header
    // input + header folder icon button), so the body destructures only
    // what it still renders.
    const {
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
      imageUrls,
      imageKinds,
      videoTrims,
      setVideoTrim,
      currentImageIndex,
      setCurrentImageIndex,
      uploading,
      uploadProgress,
      uploadFromFiles,
      uploadFromClipboard,
      addCapturedMedia,
      deleteImage,
      moveImage,
      imageError,
      addingStep,
      setAddingStep,
      addStepAt,
      setSelectedStepId,
      selectedStepId,
      steps,
      updateStep,
      currentImageSteps,
      canvasMeasurementsRef,
      notifyCanvasMeasured,
      spotlightRadiiV2,
    } = state;

    // O(1) step-number lookup + stable marker callbacks so HotspotMarker's
    // memo holds while typing in the step editor — only the edited step's
    // marker re-renders, instead of an O(n) findIndex + fresh closures per
    // marker per keystroke.
    const stepIndexById = useMemo(() => {
      const map = new Map<string, number>();
      steps.forEach((s, i) => map.set(s.id, i));
      return map;
    }, [steps]);
    const handleMarkerMove = useCallback(
      (step: GuidedLearningStep, xPct: number, yPct: number) =>
        updateStep({ ...step, xPct, yPct }),
      [updateStep]
    );
    // In-flight drag position (image-%) so the interaction preview overlay
    // tracks the marker live; cleared on pointer-up.
    const [dragPreview, setDragPreview] = useState<{
      stepId: string;
      xPct: number;
      yPct: number;
    } | null>(null);
    const handleMarkerDragPreview = useCallback(
      (stepId: string, pos: { xPct: number; yPct: number } | null) =>
        setDragPreview(pos ? { stepId, ...pos } : null),
      []
    );

    const currentImageUrl = imageUrls[currentImageIndex] ?? '';
    const currentKind = imageKinds[currentImageIndex] ?? 'image';
    const currentTrim = videoTrims[currentImageIndex] ?? null;
    const [dragActive, setDragActive] = useState(false);
    const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null);
    const [trimOpen, setTrimOpen] = useState(false);
    const [videoDuration, setVideoDuration] = useState<number | null>(null);

    // Close the trim panel and forget the loaded duration when the slide
    // changes ("adjust state while rendering" — no effect needed).
    const [prevTrimSlideUrl, setPrevTrimSlideUrl] = useState(currentImageUrl);
    if (prevTrimSlideUrl !== currentImageUrl) {
      setPrevTrimSlideUrl(currentImageUrl);
      setTrimOpen(false);
      setVideoDuration(null);
    }

    const [imgBounds, setImgBounds] = useState<{
      offsetLeft: number;
      offsetTop: number;
      width: number;
      height: number;
      containerWidth: number;
      containerHeight: number;
    } | null>(null);

    const measureImage = useCallback(() => {
      // Measure whichever media element is currently rendered. Video slides
      // expose their natural size via videoWidth/videoHeight instead.
      const media = imageRef.current ?? videoRef.current;
      if (!media || !imageContainerRef.current) {
        setImgBounds(null);
        return;
      }
      const naturalW =
        media instanceof HTMLVideoElement
          ? media.videoWidth
          : media.naturalWidth;
      const naturalH =
        media instanceof HTMLVideoElement
          ? media.videoHeight
          : media.naturalHeight;
      const rect = imageContainerRef.current.getBoundingClientRect();
      const footprint = calculateImageFootprint(
        naturalW,
        naturalH,
        rect.width,
        rect.height
      );
      // Record slide dims + container size for the load-time legacy radius migration.
      const naturalDims =
        canvasMeasurementsRef.current?.naturalDims ??
        new Map<string, { width: number; height: number }>();
      if (naturalW > 0 && naturalH > 0 && currentImageUrl) {
        naturalDims.set(currentImageUrl, { width: naturalW, height: naturalH });
      }
      canvasMeasurementsRef.current = {
        containerWidth: rect.width,
        containerHeight: rect.height,
        naturalDims,
      };
      notifyCanvasMeasured();
      setImgBounds(
        footprint
          ? {
              ...footprint,
              containerWidth: rect.width,
              containerHeight: rect.height,
            }
          : null
      );
    }, [canvasMeasurementsRef, notifyCanvasMeasured, currentImageUrl]);

    useEffect(() => {
      if (!imageContainerRef.current) return;
      const ro = new ResizeObserver(() => measureImage());
      ro.observe(imageContainerRef.current);
      return () => ro.disconnect();
    }, [currentImageUrl, measureImage]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      await uploadFromFiles(files);
      e.target.value = '';
    };

    // Native paste support — Ctrl/Cmd+V anywhere in the editor adds the
    // clipboard image as a slide (more reliable than the async Clipboard API
    // behind the Paste button, which needs a permission prompt). Skips events
    // that originate in inputs so pasting text into fields still works.
    useEffect(() => {
      const onPaste = (e: ClipboardEvent) => {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }
        const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith('image/')
        );
        if (files.length === 0) return;
        // preventDefault + capture phase: Dock's global smart-paste handler
        // respects `e.defaultPrevented`, and capture guarantees this listener
        // runs first — otherwise a single paste would both add a slide here
        // and open Dock's image-paste modal.
        e.preventDefault();
        void uploadFromFiles(files);
      };
      window.addEventListener('paste', onPaste, true);
      return () => window.removeEventListener('paste', onPaste, true);
    }, [uploadFromFiles]);

    // Drag-and-drop — the entire canvas column is a drop target. The counter
    // ref avoids flicker from dragenter/dragleave firing on child elements.
    const dragDepthRef = useRef(0);
    const handleDragEnter = (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setDragActive(true);
    };
    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragActive(false);
    };
    const handleDragOver = (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
    };
    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) void uploadFromFiles(files);
    };

    const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!addingStep || !imageContainerRef.current || !imgBounds) return;
      const containerRect = imageContainerRef.current.getBoundingClientRect();
      const left = containerRect.left + imgBounds.offsetLeft;
      const top = containerRect.top + imgBounds.offsetTop;
      const right = left + imgBounds.width;
      const bottom = top + imgBounds.height;

      if (
        e.clientX < left ||
        e.clientX > right ||
        e.clientY < top ||
        e.clientY > bottom
      ) {
        return;
      }

      const xPct = Math.max(
        2,
        Math.min(98, ((e.clientX - left) / imgBounds.width) * 100)
      );
      const yPct = Math.max(
        2,
        Math.min(98, ((e.clientY - top) / imgBounds.height) * 100)
      );
      addStepAt(xPct, yPct);
    };

    return (
      <div className="flex flex-col h-full">
        {/* Settings strip — title and folder live in the modal header now,
          so the body owns only the description and a single chip row. All
          set-level toggles (Pulse, Image transition, Welcome) collapse
          into popover chips so the image canvas keeps its vertical
          real estate. */}
        <div className="px-5 py-3 border-b border-slate-200 space-y-2.5 bg-white shrink-0">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description (optional)"
            className="w-full bg-transparent border-0 text-slate-600 placeholder:text-slate-400 focus:outline-none text-sm p-0"
          />
          {/* Chips wrap to a second row when the modal is too narrow to
            fit them on one — chip popovers are still portal'd to body so
            they can't be clipped by an overflow ancestor. Setting chips
            use leading icons (no uppercase label prefix) so the row
            packs tightly and the wrapped layout stays visually quiet. */}
          <div className="flex flex-wrap gap-x-1.5 gap-y-1.5 items-center">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                title={opt.desc}
                className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                  mode === opt.value
                    ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <span
              className="shrink-0 mx-0.5 h-4 w-px bg-slate-200"
              aria-hidden="true"
            />
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

        {/* Canvas */}
        <div
          className="flex-1 min-h-0 px-5 py-4 flex flex-col gap-3 bg-slate-50 relative"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {dragActive && (
            <div className="absolute inset-2 z-40 rounded-xl border-2 border-dashed border-brand-blue-primary bg-brand-blue-primary/10 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
              <span className="bg-brand-blue-primary text-white text-sm font-bold rounded-lg shadow-lg px-4 py-2 flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Drop images, GIFs, or videos to add slides
              </span>
            </div>
          )}
          {imageUrls.length > 0 ? (
            <>
              {imageUrls.length > 1 && (
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {imageUrls.map((url, idx) => {
                    const isVideo = (imageKinds[idx] ?? 'image') === 'video';
                    return (
                      <button
                        key={url}
                        onClick={() => setCurrentImageIndex(idx)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border transition-colors ${
                          idx === currentImageIndex
                            ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                            : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                        }`}
                      >
                        {isVideo && <Film className="w-3 h-3" aria-hidden />}
                        Slide {idx + 1}
                      </button>
                    );
                  })}
                </div>
              )}

              <div
                ref={imageContainerRef}
                className={`flex-1 min-h-0 relative rounded-lg overflow-hidden bg-slate-200 border border-slate-300 ${addingStep ? 'cursor-crosshair' : ''}`}
                onClick={handleImageClick}
                data-no-drag={addingStep ? 'true' : undefined}
              >
                {currentKind === 'video' ? (
                  <video
                    key={currentImageUrl}
                    ref={videoRef}
                    src={currentImageUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                    onLoadedMetadata={(e) => {
                      measureImage();
                      const el = e.currentTarget;
                      if (Number.isFinite(el.duration)) {
                        setVideoDuration(el.duration);
                      }
                      if (currentTrim) el.currentTime = currentTrim.start;
                    }}
                    onDurationChange={(e) => {
                      // MediaRecorder WebM blobs can report Infinity at
                      // metadata load; the real duration arrives later via
                      // this event once enough of the file has been parsed.
                      const el = e.currentTarget;
                      if (Number.isFinite(el.duration)) {
                        setVideoDuration(el.duration);
                      }
                    }}
                    onTimeUpdate={(e) => {
                      // Keep the editor preview inside the trimmed range so
                      // the teacher sees exactly what students will see.
                      if (!currentTrim) return;
                      const el = e.currentTarget;
                      // Skip while paused — trim-handle drags pause the video
                      // and scrub it, and this closure's trim state can lag a
                      // render behind the scrub position, which would snap the
                      // preview away from the user's drag.
                      if (el.paused) return;
                      if (
                        el.currentTime >= currentTrim.end ||
                        el.currentTime < currentTrim.start - 0.25
                      ) {
                        el.currentTime = currentTrim.start;
                      }
                    }}
                  />
                ) : (
                  <img
                    ref={imageRef}
                    src={currentImageUrl}
                    alt="Current step image"
                    className="w-full h-full object-contain"
                    draggable={false}
                    onLoad={measureImage}
                  />
                )}
                <InteractionPreviewOverlay
                  step={
                    steps.find(
                      (s) =>
                        s.id === selectedStepId &&
                        s.imageIndex === currentImageIndex
                    ) ?? null
                  }
                  dragPreview={dragPreview}
                  radiiAreV2={spotlightRadiiV2}
                  imgBounds={imgBounds}
                />
                {currentImageSteps.map((s) => (
                  <HotspotMarker
                    key={s.id}
                    step={s}
                    stepNumber={(stepIndexById.get(s.id) ?? -1) + 1}
                    isSelected={s.id === selectedStepId}
                    imgBounds={imgBounds}
                    containerRef={imageContainerRef}
                    onSelect={setSelectedStepId}
                    onMove={handleMarkerMove}
                    onDragPreview={handleMarkerDragPreview}
                  />
                ))}
                {addingStep && (
                  <div
                    className="absolute bg-brand-blue-primary/5 border-2 border-brand-blue-primary border-dashed rounded-lg flex items-center justify-center pointer-events-none"
                    style={
                      imgBounds
                        ? {
                            left: imgBounds.offsetLeft,
                            top: imgBounds.offsetTop,
                            width: imgBounds.width,
                            height: imgBounds.height,
                          }
                        : { inset: 0 }
                    }
                  >
                    <span className="bg-brand-blue-primary text-white text-sm font-bold rounded-lg shadow-lg px-3 py-1.5 flex items-center gap-2">
                      <MousePointerClick className="w-4 h-4" />
                      Click to place hotspot
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-300 rounded-xl text-center bg-white">
              {uploading ? (
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-blue-primary" />
                  <p className="font-medium">Uploading…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-500 px-6">
                  <ImageIcon className="w-10 h-10" />
                  <p className="font-medium">Add media to get started</p>
                  <p className="text-xs">
                    Drag &amp; drop or paste (Ctrl+V) screenshots, GIFs, or MP4
                    clips — or capture your screen below.
                  </p>
                </div>
              )}
            </div>
          )}

          {trimOpen && currentKind === 'video' && (
            <VideoTrimBar
              videoRef={videoRef}
              duration={videoDuration}
              trim={currentTrim}
              onChange={(trim) => setVideoTrim(currentImageIndex, trim)}
            />
          )}

          {uploadProgress && (
            <div className="flex items-center gap-2 text-xs font-bold text-brand-blue-primary shrink-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="truncate">
                Uploading {uploadProgress.fileName} ({uploadProgress.current} of{' '}
                {uploadProgress.total}
                {uploadProgress.percent !== null
                  ? ` · ${uploadProgress.percent}%`
                  : ''}
                )
              </span>
              {uploadProgress.percent !== null && (
                <span className="flex-1 max-w-[160px] h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <span
                    className="block h-full bg-brand-blue-primary rounded-full transition-all"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </span>
              )}
            </div>
          )}

          {imageError && (
            <p className="text-red-600 text-xs font-medium">{imageError}</p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={GL_MEDIA_ACCEPT}
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Action toolbar */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-lg transition-colors text-sm"
            >
              <Upload className="w-4 h-4" />
              Add media
            </button>
            <CaptureMenuButton onPick={setCaptureMode} />
            <button
              onClick={() => void uploadFromClipboard()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-bold rounded-lg transition-colors text-sm"
              title="Paste an image from your clipboard (or press Ctrl+V anywhere)"
            >
              <Clipboard className="w-4 h-4" />
              Paste
            </button>
            {imageUrls.length > 0 && (
              <>
                <button
                  onClick={() => setAddingStep(!addingStep)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-bold rounded-lg transition-colors text-sm border ${
                    addingStep
                      ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                      : 'bg-white border-slate-300 hover:border-slate-400 text-slate-700'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  {addingStep ? 'Click image…' : 'Add hotspot'}
                </button>
                {currentKind === 'video' && (
                  <button
                    onClick={() => setTrimOpen((v) => !v)}
                    aria-expanded={trimOpen}
                    className={`flex items-center gap-1.5 px-3 py-1.5 font-bold rounded-lg transition-colors text-sm border ${
                      trimOpen || currentTrim
                        ? 'bg-brand-blue-primary/10 border-brand-blue-primary text-brand-blue-primary'
                        : 'bg-white border-slate-300 hover:border-slate-400 text-slate-700'
                    }`}
                    title="Trim which part of this video plays"
                  >
                    <Scissors className="w-4 h-4" />
                    {currentTrim ? 'Trimmed' : 'Trim'}
                  </button>
                )}
                {imageUrls.length > 1 && (
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      onClick={() => moveImage(currentImageIndex, -1)}
                      disabled={currentImageIndex === 0}
                      className="p-1.5 text-slate-500 disabled:opacity-30 hover:bg-slate-200 rounded transition-colors"
                      aria-label="Move slide earlier"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveImage(currentImageIndex, 1)}
                      disabled={currentImageIndex === imageUrls.length - 1}
                      className="p-1.5 text-slate-500 disabled:opacity-30 hover:bg-slate-200 rounded transition-colors"
                      aria-label="Move slide later"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <button
                  onClick={() => deleteImage(currentImageIndex)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:border-red-300 hover:bg-red-50 text-slate-700 hover:text-red-700 font-bold rounded-lg transition-colors text-sm ${imageUrls.length > 1 ? '' : 'ml-auto'}`}
                  aria-label="Delete current slide"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete slide
                </button>
              </>
            )}
          </div>
        </div>

        {captureMode && (
          <ScreenCaptureModal
            mode={captureMode}
            onAddMedia={addCapturedMedia}
            onClose={() => setCaptureMode(null)}
          />
        )}
      </div>
    );
  },
  glContextPanePropsEqual
);

// ─── Detail pane ─────────────────────────────────────────────────────────────

/**
 * Slice comparator for the detail pane — same contract as
 * `glContextPanePropsEqual`. `selectedStepId` also covers the identity of
 * `deleteStep` (which closes over it); the other callbacks the pane uses
 * are referentially stable.
 */
const glDetailPanePropsEqual = (prev: PaneProps, next: PaneProps): boolean =>
  prev.state.steps === next.state.steps &&
  prev.state.selectedStep === next.state.selectedStep &&
  prev.state.selectedStepId === next.state.selectedStepId &&
  prev.state.addingStep === next.state.addingStep &&
  prev.state.imageUrls === next.state.imageUrls &&
  prev.state.currentImageIndex === next.state.currentImageIndex;

export const GuidedLearningEditorDetailPane = React.memo(
  function GuidedLearningEditorDetailPane({ state }: PaneProps) {
    const {
      selectedStep,
      selectedStepId,
      setSelectedStepId,
      setAddingStep,
      addingStep,
      imageUrls,
      steps,
      updateStep,
      deleteStep,
      reorderSteps,
      currentImageSteps,
      currentImageIndex,
      setCurrentImageIndex,
    } = state;

    const showNavigator = steps.length > 0;
    // O(1) lookup instead of an O(n) findIndex per keystroke.
    const stepIndexById = useMemo(() => {
      const map = new Map<string, number>();
      steps.forEach((s, i) => map.set(s.id, i));
      return map;
    }, [steps]);
    const stepNumber = selectedStepId
      ? (stepIndexById.get(selectedStepId) ?? -1) + 1
      : 0;

    // Stable handler so the memoized navigator pills don't all re-render on
    // slide changes. `setCurrentImageIndex` is called unconditionally —
    // React bails out on same-value setState, so this matches the previous
    // "only set when different" behavior.
    const handleNavigatorSelect = useCallback(
      (step: GuidedLearningStep) => {
        setCurrentImageIndex(step.imageIndex);
        setSelectedStepId(step.id);
      },
      [setCurrentImageIndex, setSelectedStepId]
    );

    return (
      <div className="flex flex-col h-full">
        {showNavigator && (
          <StepNavigator
            steps={steps}
            selectedStepId={selectedStepId}
            imageCount={imageUrls.length}
            currentImageIndex={currentImageIndex}
            onSelectStep={handleNavigatorSelect}
            onReorder={reorderSteps}
          />
        )}

        <div className="flex-1 min-h-0">
          {selectedStep ? (
            <GuidedLearningStepEditor
              key={selectedStep.id}
              step={selectedStep}
              stepNumber={stepNumber}
              imageCount={imageUrls.length}
              onChange={updateStep}
              onDelete={() => deleteStep(selectedStep.id)}
            />
          ) : (
            <div className="flex flex-col h-full items-center justify-center text-center px-8 py-12 text-slate-500">
              <MousePointerClick className="w-10 h-10 mb-3 text-slate-400" />
              <h4 className="text-base font-bold text-slate-700 mb-1">
                {imageUrls.length === 0
                  ? 'Add an image first'
                  : 'Pick a hotspot to edit'}
              </h4>
              <p className="text-sm max-w-xs">
                {imageUrls.length === 0
                  ? 'Upload an image on the left, then add hotspots to make it interactive.'
                  : currentImageSteps.length === 0
                    ? 'No hotspots on this image yet — click "Add hotspot" then click anywhere on the image.'
                    : 'Click a numbered hotspot on the image, or add a new one.'}
              </p>
              {imageUrls.length > 0 && !addingStep && (
                <button
                  onClick={() => {
                    setSelectedStepId(null);
                    setAddingStep(true);
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-lg text-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add hotspot
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
  glDetailPanePropsEqual
);

// ─── Step navigator (sortable pill strip) ────────────────────────────────────

interface StepNavigatorProps {
  steps: GuidedLearningStep[];
  selectedStepId: string | null;
  imageCount: number;
  currentImageIndex: number;
  onSelectStep: (step: GuidedLearningStep) => void;
  onReorder: (next: GuidedLearningStep[]) => void;
}

/** Hoisted so SortableList's memoized id array survives re-renders. */
const getStepId = (s: GuidedLearningStep) => s.id;

interface StepPillProps {
  step: GuidedLearningStep;
  index: number;
  isSelected: boolean;
  imageCount: number;
  onSelect: (step: GuidedLearningStep) => void;
  dragHandleAttributes: React.HTMLAttributes<HTMLElement>;
  dragHandleListeners: Record<string, (event: Event) => void> | undefined;
}

/**
 * Memo comparator for the navigator pills. Compares the step by reference
 * (an edit replaces the step object) and intentionally EXCLUDES the
 * drag-handle props: dnd-kit recreates `attributes`/`listeners` objects on
 * every render, but for a given sortable id they are functionally
 * equivalent, so comparing them would defeat the memo.
 */
const stepPillPropsEqual = (
  prev: StepPillProps,
  next: StepPillProps
): boolean =>
  prev.step === next.step &&
  prev.index === next.index &&
  prev.isSelected === next.isSelected &&
  prev.imageCount === next.imageCount &&
  prev.onSelect === next.onSelect;

const StepPill = React.memo(function StepPill({
  step: s,
  index: idx,
  isSelected,
  imageCount,
  onSelect,
  dragHandleAttributes,
  dragHandleListeners,
}: StepPillProps) {
  return (
    <button
      type="button"
      {...dragHandleAttributes}
      onPointerDown={
        dragHandleListeners?.onPointerDown as
          | React.PointerEventHandler<HTMLButtonElement>
          | undefined
      }
      onClick={() => onSelect(s)}
      aria-label={`Step ${idx + 1}${imageCount > 1 ? ` on image ${s.imageIndex + 1}` : ''}${s.label ? `: ${s.label}` : ''}`}
      title={s.label?.trim() ? s.label : `Step ${idx + 1}`}
      className={`shrink-0 cursor-grab active:cursor-grabbing touch-none flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border transition-colors ${
        isSelected
          ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
          : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
      }`}
    >
      <span className="font-mono">{idx + 1}</span>
      {imageCount > 1 && (
        <span
          className={`text-xxs font-mono px-1 rounded ${
            isSelected
              ? 'bg-brand-blue-dark text-white'
              : 'bg-slate-100 text-slate-500'
          }`}
          aria-hidden
        >
          i{s.imageIndex + 1}
        </span>
      )}
    </button>
  );
}, stepPillPropsEqual);

const StepNavigator: React.FC<StepNavigatorProps> = ({
  steps,
  selectedStepId,
  imageCount,
  onSelectStep,
  onReorder,
}) => {
  return (
    <div className="px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xxs font-bold uppercase tracking-wider text-slate-500">
          Step order
        </span>
        <span className="text-xxs text-slate-400">Drag to reorder</span>
      </div>
      <SortableList
        items={steps}
        getId={getStepId}
        onReorder={onReorder}
        layout="grid"
        renderItem={(s, handle, index) => (
          <StepPill
            step={s}
            index={index}
            isSelected={s.id === selectedStepId}
            imageCount={imageCount}
            onSelect={onSelectStep}
            dragHandleAttributes={handle.attributes}
            dragHandleListeners={handle.listeners}
          />
        )}
        className="flex flex-wrap gap-1.5"
      />
    </div>
  );
};

// ─── Live interaction preview (spotlight + zoom extent) ──────────────────────

interface InteractionPreviewOverlayProps {
  step: GuidedLearningStep | null;
  dragPreview: { stepId: string; xPct: number; yPct: number } | null;
  radiiAreV2: boolean;
  imgBounds: {
    offsetLeft: number;
    offsetTop: number;
    width: number;
    height: number;
    containerWidth: number;
    containerHeight: number;
  } | null;
}

/**
 * Live-renders the selected step's player visuals on the editor canvas:
 * the spotlight overlay (image-relative radius once the load-time v2
 * conversion has run, legacy container-relative until/unless it does — so
 * the preview always matches what save will persist) and a dashed outline
 * approximating what a pan-zoom step will frame — exact only when the
 * player container matches this canvas's aspect ratio.
 */
const InteractionPreviewOverlay: React.FC<InteractionPreviewOverlayProps> = ({
  step,
  dragPreview,
  radiiAreV2,
  imgBounds,
}) => {
  if (!step || !imgBounds) return null;
  const type = step.interactionType;
  const showSpotlight = type === 'spotlight' || type === 'pan-zoom-spotlight';
  const showZoom = type === 'pan-zoom' || type === 'pan-zoom-spotlight';
  if (!showSpotlight && !showZoom) return null;

  const { containerWidth, containerHeight } = imgBounds;
  const imgOffset = toImageOffset(imgBounds, containerWidth, containerHeight);
  const livePos =
    dragPreview && dragPreview.stepId === step.id
      ? { xPct: dragPreview.xPct, yPct: dragPreview.yPct }
      : { xPct: step.xPct, yPct: step.yPct };
  const containerPos = toContainerCoords(livePos.xPct, livePos.yPct, imgOffset);
  if (!containerPos) return null;

  const zoomScale = step.panZoomScale ?? 2.5;
  const extent = showZoom
    ? computeZoomExtentRect(
        containerPos.xPct,
        containerPos.yPct,
        zoomScale,
        containerWidth,
        containerHeight
      )
    : null;

  return (
    // zIndex 0 traps the spotlight SVG's z-20 inside this stacking context
    // so hotspot markers (later in DOM order) stay clickable above it.
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
      data-testid="gl-editor-interaction-preview"
    >
      {showSpotlight && (
        <SpotlightInteraction
          step={{
            id: step.id,
            xPct: containerPos.xPct,
            yPct: containerPos.yPct,
            imageIndex: step.imageIndex,
            interactionType: step.interactionType,
            label: step.label,
            spotlightRadius: radiiAreV2
              ? toContainerSpotlightRadiusPct(
                  step.spotlightRadius ?? 25,
                  imgOffset,
                  containerWidth,
                  containerHeight
                )
              : (step.spotlightRadius ?? 25),
          }}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
        />
      )}
      {extent && (
        <div
          className="absolute border-2 border-dashed border-white/90 rounded-md shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          data-testid="gl-editor-zoom-extent"
          style={{
            left: extent.left,
            top: extent.top,
            width: extent.width,
            height: extent.height,
          }}
        >
          <span className="absolute left-1.5 top-1.5 rounded bg-slate-900/70 px-1.5 py-0.5 text-xxs font-bold text-white backdrop-blur-sm">
            Zoom {zoomScale}× (approx frame)
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Draggable hotspot marker ────────────────────────────────────────────────

interface HotspotMarkerProps {
  step: GuidedLearningStep;
  stepNumber: number;
  isSelected: boolean;
  imgBounds: {
    offsetLeft: number;
    offsetTop: number;
    width: number;
    height: number;
  } | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onMove: (step: GuidedLearningStep, xPct: number, yPct: number) => void;
  onDragPreview: (
    stepId: string,
    pos: { xPct: number; yPct: number } | null
  ) => void;
}

const DRAG_THRESHOLD_PX = 4;

// Plain React.memo: with id/step-based callbacks every prop is referentially
// stable between renders, so typing in the step editor re-renders only the
// edited step's marker (its `step` object is replaced) — not every marker
// on the canvas.
const HotspotMarker = React.memo(function HotspotMarker({
  step,
  stepNumber,
  isSelected,
  imgBounds,
  containerRef,
  onSelect,
  onMove,
  onDragPreview,
}: HotspotMarkerProps) {
  // Local position used during a drag so the marker tracks the cursor; steps
  // without a live preview skip onDragPreview, avoiding parent re-renders.
  // Cleared on pointer-up; the next render reads from the persisted step.
  const [dragPos, setDragPos] = useState<{ xPct: number; yPct: number } | null>(
    null
  );
  const xPct = dragPos?.xPct ?? step.xPct;
  const yPct = dragPos?.yPct ?? step.yPct;
  // Only these interaction types render a live preview overlay while dragging.
  const hasLivePreview =
    step.interactionType === 'spotlight' ||
    step.interactionType === 'pan-zoom' ||
    step.interactionType === 'pan-zoom-spotlight';

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!imgBounds || !containerRef.current) {
      onSelect(step.id);
      return;
    }
    const startX = e.clientX;
    const startY = e.clientY;
    const containerRect = containerRef.current.getBoundingClientRect();
    let dragged = false;
    let lastXPct = step.xPct;
    let lastYPct = step.yPct;
    const target = e.currentTarget;

    const computePct = (clientX: number, clientY: number) => {
      const x = clientX - containerRect.left - imgBounds.offsetLeft;
      const y = clientY - containerRect.top - imgBounds.offsetTop;
      const px = (x / imgBounds.width) * 100;
      const py = (y / imgBounds.height) * 100;
      return {
        xPct: Math.max(2, Math.min(98, px)),
        yPct: Math.max(2, Math.min(98, py)),
      };
    };

    const onMoveEvt = (ev: PointerEvent) => {
      if (!dragged) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
        dragged = true;
        // Select on drag-start so the dragged step's preview renders live.
        onSelect(step.id);
      }
      const next = computePct(ev.clientX, ev.clientY);
      lastXPct = next.xPct;
      lastYPct = next.yPct;
      setDragPos(next);
      if (hasLivePreview) onDragPreview(step.id, next);
    };

    const onUpEvt = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMoveEvt);
      window.removeEventListener('pointerup', onUpEvt);
      window.removeEventListener('pointercancel', onUpEvt);
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        // already released
      }
      if (dragged) {
        onMove(step, lastXPct, lastYPct);
        setDragPos(null);
        if (hasLivePreview) onDragPreview(step.id, null);
      } else {
        onSelect(step.id);
      }
    };

    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // capture not supported — fall through to window listeners
    }
    window.addEventListener('pointermove', onMoveEvt);
    window.addEventListener('pointerup', onUpEvt);
    window.addEventListener('pointercancel', onUpEvt);
  };

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      aria-label={`Hotspot ${stepNumber} — drag to move, click to edit`}
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing select-none shadow-md transition-transform touch-none ${
        isSelected
          ? 'bg-brand-blue-primary text-white border-2 border-white ring-2 ring-brand-blue-primary/40 scale-110'
          : 'bg-brand-blue-primary text-white border-2 border-white hover:scale-110'
      }`}
      style={
        imgBounds
          ? {
              left: imgBounds.offsetLeft + (xPct / 100) * imgBounds.width,
              top: imgBounds.offsetTop + (yPct / 100) * imgBounds.height,
              width: 24,
              height: 24,
              fontSize: 11,
            }
          : {
              left: `${xPct}%`,
              top: `${yPct}%`,
              width: 24,
              height: 24,
              fontSize: 11,
            }
      }
    >
      {stepNumber}
    </button>
  );
});
