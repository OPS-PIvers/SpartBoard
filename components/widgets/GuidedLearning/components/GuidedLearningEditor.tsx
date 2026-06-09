import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
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
  MessageSquare,
  Camera,
  Circle,
  Film,
  MonitorUp,
  Scissors,
  type LucideIcon,
} from 'lucide-react';
import { GuidedLearningMode, GuidedLearningVideoTrim } from '@/types';
import { SortableList } from '@/components/common/SortableList';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';
import { GL_MEDIA_ACCEPT } from '@/utils/guidedLearningMedia';
import { GuidedLearningStepEditor } from './GuidedLearningStepEditor';
import { ScreenCaptureModal, type CaptureMode } from './ScreenCaptureModal';
import { calculateImageFootprint } from '../utils/imageUtils';
import type { GuidedLearningEditorController } from './useGuidedLearningEditorState';

/**
 * Compute viewport-relative coordinates for a popover anchored under a
 * trigger button. Clamped 8px in from the right edge so the popover
 * never tucks under the modal close button on tight widths.
 */
const usePopoverPosition = (
  open: boolean,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  width: number
): { top: number; left: number } | null => {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportW =
        typeof window !== 'undefined' ? window.innerWidth : rect.right;
      const left = Math.max(8, Math.min(rect.left, viewportW - width - 8));
      setPos({ top: rect.bottom + 4, left });
    };
    update();
    // Reposition on resize / scroll so the popover stays anchored if the
    // user resizes the modal or scrolls the chip into view.
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, triggerRef, width]);
  return pos;
};

const MODE_OPTIONS: {
  value: GuidedLearningMode;
  label: string;
  desc: string;
}[] = [
  {
    value: 'structured',
    label: 'Structured',
    desc: 'Step-by-step with Prev/Next',
  },
  { value: 'guided', label: 'Guided', desc: 'Auto-advances with Play/Pause' },
  { value: 'explore', label: 'Explore', desc: 'Student clicks any hotspot' },
];

const PULSE_OPTIONS: {
  value: 'consistent' | 'reminder' | 'off';
  label: string;
  desc: string;
}[] = [
  {
    value: 'consistent',
    label: 'Consistent',
    desc: 'Continuous breathing pulse so hotspots are always discoverable.',
  },
  {
    value: 'reminder',
    label: 'Reminder',
    desc: 'A brief shake every few seconds to draw the eye occasionally.',
  },
  {
    value: 'off',
    label: 'Off',
    desc: 'No animation — hotspots stay still.',
  },
];

const TRANSITION_OPTIONS: {
  value: 'none' | 'slide' | 'fade';
  label: string;
  desc: string;
}[] = [
  {
    value: 'none',
    label: 'None',
    desc: 'Instant swap when changing images — fastest, no animation.',
  },
  {
    value: 'slide',
    label: 'Slide',
    desc: 'New image slides in from the right; previous image exits left.',
  },
  {
    value: 'fade',
    label: 'Fade',
    desc: 'Cross-dissolve between the previous and new image.',
  },
];

// ─── SettingChip (compact "Label: value ▾" with popover) ─────────────────────

interface SettingChipOption<T extends string> {
  value: T;
  label: string;
  desc: string;
}

interface SettingChipProps<T extends string> {
  label: string;
  /**
   * Leading icon that identifies what the chip controls. The verbose
   * uppercase label is intentionally replaced by an icon so the chip row
   * fits in narrower modal widths; `label` is preserved as the tooltip.
   */
  icon: LucideIcon;
  value: T;
  options: SettingChipOption<T>[];
  onChange: (next: T) => void;
}

/**
 * Compact "Label: value ▾" chip that opens a small popover of options.
 * Replaces a labeled segmented row when the row would consume more
 * vertical space than the choice deserves (e.g. set-level display
 * settings the teacher tweaks once and forgets).
 */
const SETTING_CHIP_POPOVER_WIDTH = 220;

function SettingChip<T extends string>({
  label,
  icon: Icon,
  value,
  options,
  onChange,
}: SettingChipProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Click-outside listens on both the chip container AND the portal'd
  // popover so clicks inside the popover don't dismiss it.
  useClickOutside(containerRef, () => setOpen(false), [popoverRef]);

  const current = options.find((o) => o.value === value);
  const currentLabel = current?.label ?? value;
  const pos = usePopoverPosition(open, triggerRef, SETTING_CHIP_POPOVER_WIDTH);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${label}${current?.desc ? ` — ${current.desc}` : ''}`}
        aria-label={`${label}: ${currentLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition-colors ${
          open
            ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
            : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
        }`}
      >
        <Icon className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
        <span>{currentLabel}</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        // Portal'd to document.body so the popover escapes the modal
        // body's `overflow-hidden` and the chip row's `overflow-x-auto`.
        // Without this the menu was being clipped by ancestor scroll
        // containers and inaccessible.
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            data-click-outside-ignore="true"
            className="overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: SETTING_CHIP_POPOVER_WIDTH,
              zIndex: Z_INDEX.modalContent,
            }}
          >
            {options.map((opt) => {
              const isCurrent = opt.value === value;
              return (
                <button
                  key={opt.value}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                    isCurrent
                      ? 'bg-brand-blue-lighter/40 text-brand-blue-dark'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-bold text-xs">{opt.label}</span>
                  <span className="text-xxs text-slate-500 leading-snug">
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

// ─── WelcomeChip (compact "Welcome: On/Off ▾" with a textarea popover) ───────

interface WelcomeChipProps {
  enabled: boolean;
  message: string;
  onEnabledChange: (next: boolean) => void;
  onMessageChange: (next: string) => void;
}

/**
 * Compact chip that surfaces the welcome-screen toggle + message
 * textarea in a popover instead of an always-visible block. Same
 * dismiss-on-outside-click contract as `SettingChip`. Keeping the
 * textarea in a popover lets the editor body stay short — the image
 * canvas keeps its real estate even when a welcome message is set.
 */
const WELCOME_CHIP_POPOVER_WIDTH = 320;

const WelcomeChip: React.FC<WelcomeChipProps> = ({
  enabled,
  message,
  onEnabledChange,
  onMessageChange,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setOpen(false), [popoverRef]);

  const trimmed = message.trim();
  // The chip's status mirrors what the student app actually does at
  // render time: an enabled toggle without content falls back to the
  // default subtitle, so we surface it as "Off" here too.
  const status = enabled && trimmed.length > 0 ? 'On' : 'Off';
  const pos = usePopoverPosition(open, triggerRef, WELCOME_CHIP_POPOVER_WIDTH);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Welcome screen — customize what students see before they start"
        aria-label={`Welcome screen: ${status}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition-colors ${
          open || status === 'On'
            ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
            : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
        }`}
      >
        <MessageSquare
          className="w-3.5 h-3.5 text-slate-500"
          aria-hidden="true"
        />
        <span>{status}</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        // Portal'd to document.body so the popover escapes the modal
        // body's `overflow-hidden` and the chip row's `overflow-x-auto`.
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Welcome screen settings"
            data-click-outside-ignore="true"
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: WELCOME_CHIP_POPOVER_WIDTH,
              zIndex: Z_INDEX.modalContent,
            }}
          >
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onEnabledChange(e.target.checked)}
                className="accent-brand-blue-primary w-4 h-4 mt-0.5"
              />
              <span>
                <span className="font-bold text-xs">Show welcome screen</span>
                <span className="block text-xxs font-medium text-slate-500 mt-0.5 leading-snug">
                  Replaces the default mode/step subtitle on the student start
                  screen with your custom message and changes the Start button
                  to &quot;Get started&quot;.
                </span>
              </span>
            </label>
            <textarea
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              disabled={!enabled}
              rows={3}
              placeholder="e.g. Welcome to the Civil War tour. Click pins to explore each station."
              className="mt-2 w-full bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary px-3 py-2 text-sm resize-none disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>,
          document.body
        )}
    </div>
  );
};

// ─── Context pane ────────────────────────────────────────────────────────────

interface PaneProps {
  state: GuidedLearningEditorController;
}

export const GuidedLearningEditorContextPane: React.FC<PaneProps> = ({
  state,
}) => {
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
  } = state;

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
      media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
    const naturalH =
      media instanceof HTMLVideoElement
        ? media.videoHeight
        : media.naturalHeight;
    const footprint = calculateImageFootprint(
      naturalW,
      naturalH,
      imageContainerRef.current.getBoundingClientRect().width,
      imageContainerRef.current.getBoundingClientRect().height
    );
    setImgBounds(footprint);
  }, []);

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
              {currentImageSteps.map((s) => {
                const globalIndex = steps.findIndex((x) => x.id === s.id);
                return (
                  <HotspotMarker
                    key={s.id}
                    step={s}
                    stepNumber={globalIndex + 1}
                    isSelected={s.id === selectedStepId}
                    imgBounds={imgBounds}
                    containerRef={imageContainerRef}
                    onSelect={() => setSelectedStepId(s.id)}
                    onMove={(xPct, yPct) => updateStep({ ...s, xPct, yPct })}
                  />
                );
              })}
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
                className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:border-red-300 hover:bg-red-50 text-slate-600 hover:text-red-600 font-bold rounded-lg transition-colors text-sm ${imageUrls.length > 1 ? '' : 'ml-auto'}`}
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
};

// ─── Capture menu (Snap / Record / From video) ───────────────────────────────

const CAPTURE_OPTIONS: {
  value: CaptureMode;
  label: string;
  desc: string;
  icon: LucideIcon;
}[] = [
  {
    value: 'snap',
    label: 'Snap screen frames',
    desc: 'Share your screen and snap a still for each step of a workflow.',
    icon: Camera,
  },
  {
    value: 'record',
    label: 'Record your screen',
    desc: 'Capture the workflow as a video slide.',
    icon: Circle,
  },
  {
    value: 'video-file',
    label: 'Slides from a video',
    desc: 'Extract frames from an MP4/WebM, or add the whole clip.',
    icon: Film,
  },
];

const CAPTURE_MENU_WIDTH = 260;

const CaptureMenuButton: React.FC<{
  onPick: (mode: CaptureMode) => void;
}> = ({ onPick }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setOpen(false), [popoverRef]);
  const pos = usePopoverPosition(open, triggerRef, CAPTURE_MENU_WIDTH);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-1.5 font-bold rounded-lg transition-colors text-sm border ${
          open
            ? 'bg-brand-blue-primary/10 border-brand-blue-primary text-brand-blue-primary'
            : 'bg-white border-slate-300 hover:border-slate-400 text-slate-700'
        }`}
      >
        <MonitorUp className="w-4 h-4" />
        Capture screen
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            data-click-outside-ignore="true"
            className="overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: CAPTURE_MENU_WIDTH,
              zIndex: Z_INDEX.modalContent,
            }}
          >
            {CAPTURE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(opt.value);
                }}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-slate-700 transition-colors hover:bg-slate-100"
              >
                <opt.icon className="w-4 h-4 mt-0.5 shrink-0 text-brand-blue-primary" />
                <span>
                  <span className="block font-bold text-xs">{opt.label}</span>
                  <span className="block text-xxs text-slate-500 leading-snug">
                    {opt.desc}
                  </span>
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};

// ─── Video trim bar ──────────────────────────────────────────────────────────

function formatTrimTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/**
 * Dual-handle playback-range selector for the current video slide.
 * Non-destructive: writes `{start, end}` seconds via `onChange` (or `null`
 * when the handles cover the full video). Dragging a handle scrubs the
 * canvas video to that moment so the teacher can find cut points visually.
 */
const VideoTrimBar: React.FC<{
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Video duration in seconds; null while metadata is still loading. */
  duration: number | null;
  trim: GuidedLearningVideoTrim | null;
  onChange: (trim: GuidedLearningVideoTrim | null) => void;
}> = ({ videoRef, duration, trim, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);

  if (duration === null) {
    return (
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 shrink-0">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading video…
      </div>
    );
  }

  const minGap = Math.min(0.5, duration);
  const start = Math.min(trim?.start ?? 0, Math.max(duration - minGap, 0));
  const end = Math.min(trim?.end ?? duration, duration);

  const commit = (nextStart: number, nextEnd: number) => {
    // Full-range selection = no trim; drop the field instead of storing a
    // degenerate {0, duration} that would block playback-rate edge cases.
    if (nextStart <= 0.05 && nextEnd >= duration - 0.05) {
      onChange(null);
      return;
    }
    onChange({
      start: Math.round(nextStart * 10) / 10,
      end: Math.round(nextEnd * 10) / 10,
    });
  };

  const scrubTo = (seconds: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = seconds;
  };

  const beginDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    handle: 'start' | 'end'
  ) => {
    const track = trackRef.current;
    if (!track) return;
    e.preventDefault();
    // Pause while scrubbing so the dragged frame holds still; always resume
    // on release — the editor preview is a muted autoplay loop, and reading
    // `paused` here races against the previous drag's async play().
    videoRef.current?.pause();
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // capture not supported — window listeners below still work
    }

    const timeAt = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      // A hidden/zero-width track would yield NaN and poison the trim state.
      if (rect.width === 0) return 0;
      const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      return pct * duration;
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const t = timeAt(ev.clientX);
      if (handle === 'start') {
        const next = Math.min(t, end - minGap);
        commit(Math.max(next, 0), end);
        scrubTo(Math.max(next, 0));
      } else {
        const next = Math.max(t, start + minGap);
        commit(start, Math.min(next, duration));
        scrubTo(Math.min(next, duration));
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      try {
        if (target.hasPointerCapture(ev.pointerId)) {
          target.releasePointerCapture(ev.pointerId);
        }
      } catch {
        // capture not supported — nothing to release
      }
      void videoRef.current?.play().catch(() => undefined);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const nudge = (handle: 'start' | 'end', deltaSeconds: number) => {
    if (handle === 'start') {
      const next = Math.min(Math.max(start + deltaSeconds, 0), end - minGap);
      commit(next, end);
      scrubTo(next);
    } else {
      const next = Math.max(
        Math.min(end + deltaSeconds, duration),
        start + minGap
      );
      commit(start, next);
      scrubTo(next);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    handle: 'start' | 'end'
  ) => {
    const step = e.shiftKey ? 2 : 0.5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      nudge(handle, -step);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      nudge(handle, step);
    }
  };

  const startPct = (start / duration) * 100;
  const endPct = (end / duration) * 100;

  const handleClasses =
    'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-7 rounded-md bg-white border-2 border-brand-blue-primary shadow-sm cursor-ew-resize touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50';

  return (
    <div className="flex flex-wrap items-center gap-3 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600 shrink-0">
        <Scissors className="w-3.5 h-3.5 text-brand-blue-primary" />
        Trim
      </span>
      <div
        ref={trackRef}
        className="relative flex-1 min-w-[180px] h-7 select-none"
      >
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-slate-200" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-brand-blue-primary"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Trim start"
          aria-valuemin={0}
          aria-valuemax={Math.max(end - minGap, 0)}
          aria-valuenow={start}
          aria-valuetext={formatTrimTime(start)}
          className={handleClasses}
          style={{ left: `${startPct}%` }}
          onPointerDown={(e) => beginDrag(e, 'start')}
          onKeyDown={(e) => handleKeyDown(e, 'start')}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Trim end"
          aria-valuemin={Math.min(start + minGap, duration)}
          aria-valuemax={duration}
          aria-valuenow={end}
          aria-valuetext={formatTrimTime(end)}
          className={handleClasses}
          style={{ left: `${endPct}%` }}
          onPointerDown={(e) => beginDrag(e, 'end')}
          onKeyDown={(e) => handleKeyDown(e, 'end')}
        />
      </div>
      <span className="text-xs font-mono font-medium text-slate-600 tabular-nums shrink-0">
        {formatTrimTime(start)} – {formatTrimTime(end)}
        <span className="text-slate-400"> / {formatTrimTime(duration)}</span>
      </span>
      <button
        onClick={() => {
          onChange(null);
          scrubTo(0);
        }}
        disabled={!trim}
        className="text-xs font-bold text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-default transition-colors shrink-0"
      >
        Reset
      </button>
    </div>
  );
};

// ─── Detail pane ─────────────────────────────────────────────────────────────

export const GuidedLearningEditorDetailPane: React.FC<PaneProps> = ({
  state,
}) => {
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
  const stepNumber = selectedStepId
    ? steps.findIndex((s) => s.id === selectedStepId) + 1
    : 0;

  return (
    <div className="flex flex-col h-full">
      {showNavigator && (
        <StepNavigator
          steps={steps}
          selectedStepId={selectedStepId}
          imageCount={imageUrls.length}
          currentImageIndex={currentImageIndex}
          onSelectStep={(step) => {
            if (step.imageIndex !== currentImageIndex) {
              setCurrentImageIndex(step.imageIndex);
            }
            setSelectedStepId(step.id);
          }}
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
};

// ─── Step navigator (sortable pill strip) ────────────────────────────────────

interface StepNavigatorProps {
  steps: import('@/types').GuidedLearningStep[];
  selectedStepId: string | null;
  imageCount: number;
  currentImageIndex: number;
  onSelectStep: (step: import('@/types').GuidedLearningStep) => void;
  onReorder: (next: import('@/types').GuidedLearningStep[]) => void;
}

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
        getId={(s) => s.id}
        onReorder={onReorder}
        renderItem={(s, handle) => {
          const idx = steps.findIndex((x) => x.id === s.id);
          const isSelected = s.id === selectedStepId;
          return (
            <button
              type="button"
              {...handle.attributes}
              onPointerDown={
                handle.listeners?.onPointerDown as
                  | React.PointerEventHandler<HTMLButtonElement>
                  | undefined
              }
              onClick={() => onSelectStep(s)}
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
                      ? 'bg-brand-blue-dark text-white/80'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                  aria-hidden
                >
                  i{s.imageIndex + 1}
                </span>
              )}
            </button>
          );
        }}
        className="flex flex-wrap gap-1.5"
      />
    </div>
  );
};

// ─── Draggable hotspot marker ────────────────────────────────────────────────

interface HotspotMarkerProps {
  step: import('@/types').GuidedLearningStep;
  stepNumber: number;
  isSelected: boolean;
  imgBounds: {
    offsetLeft: number;
    offsetTop: number;
    width: number;
    height: number;
  } | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onMove: (xPct: number, yPct: number) => void;
}

const DRAG_THRESHOLD_PX = 4;

const HotspotMarker: React.FC<HotspotMarkerProps> = ({
  step,
  stepNumber,
  isSelected,
  imgBounds,
  containerRef,
  onSelect,
  onMove,
}) => {
  // Local position used during a drag so the marker tracks the cursor without
  // a parent re-render per pointer move. Cleared on pointer-up; the next
  // render reads from the persisted step.
  const [dragPos, setDragPos] = useState<{ xPct: number; yPct: number } | null>(
    null
  );
  const xPct = dragPos?.xPct ?? step.xPct;
  const yPct = dragPos?.yPct ?? step.yPct;

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!imgBounds || !containerRef.current) {
      onSelect();
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
      }
      const next = computePct(ev.clientX, ev.clientY);
      lastXPct = next.xPct;
      lastYPct = next.yPct;
      setDragPos(next);
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
        onMove(lastXPct, lastYPct);
        setDragPos(null);
      } else {
        onSelect();
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
};
