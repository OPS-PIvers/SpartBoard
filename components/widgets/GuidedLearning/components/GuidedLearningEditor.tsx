import React, { useState, useRef, useCallback, useEffect } from 'react';
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
} from 'lucide-react';
import { GuidedLearningMode } from '@/types';
import { SortableList } from '@/components/common/SortableList';
import { useClickOutside } from '@/hooks/useClickOutside';
import { GuidedLearningStepEditor } from './GuidedLearningStepEditor';
import { calculateImageFootprint } from '../utils/imageUtils';
import type { GuidedLearningEditorController } from './useGuidedLearningEditorState';

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
function SettingChip<T extends string>({
  label,
  value,
  options,
  onChange,
}: SettingChipProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const current = options.find((o) => o.value === value);
  const currentLabel = current?.label ?? value;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={current?.desc}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
          open
            ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
            : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
        }`}
      >
        <span className="text-slate-500 font-medium uppercase tracking-wider text-xxs">
          {label}
        </span>
        <span>{currentLabel}</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-10 mt-1 min-w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
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
        </div>
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
const WelcomeChip: React.FC<WelcomeChipProps> = ({
  enabled,
  message,
  onEnabledChange,
  onMessageChange,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const trimmed = message.trim();
  // The chip's status mirrors what the student app actually does at
  // render time: an enabled toggle without content falls back to the
  // default subtitle, so we surface it as "Off" here too.
  const status = enabled && trimmed.length > 0 ? 'On' : 'Off';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Customize the welcome screen students see before they start."
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
          open || status === 'On'
            ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
            : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
        }`}
      >
        <span className="text-slate-500 font-medium uppercase tracking-wider text-xxs">
          Welcome
        </span>
        <span>{status}</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Welcome screen settings"
          className="absolute left-0 top-full z-10 mt-1 w-[320px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
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
                screen with your custom message and changes the Start button to
                &quot;Get started&quot;.
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
        </div>
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
    currentImageIndex,
    setCurrentImageIndex,
    uploading,
    uploadFromFiles,
    uploadFromClipboard,
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

  const [imgBounds, setImgBounds] = useState<{
    offsetLeft: number;
    offsetTop: number;
    width: number;
    height: number;
  } | null>(null);

  const measureImage = useCallback(() => {
    if (!imageRef.current || !imageContainerRef.current) {
      setImgBounds(null);
      return;
    }
    const footprint = calculateImageFootprint(
      imageRef.current.naturalWidth,
      imageRef.current.naturalHeight,
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
        <div className="flex flex-wrap gap-2 items-center">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setMode(opt.value)}
              title={opt.desc}
              className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                mode === opt.value
                  ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />
          <SettingChip
            label="Pulse"
            value={hotspotPulse}
            options={PULSE_OPTIONS}
            onChange={setHotspotPulse}
          />
          <SettingChip
            label="Image transition"
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
      <div className="flex-1 min-h-0 px-5 py-4 flex flex-col gap-3 bg-slate-50">
        {imageUrls.length > 0 ? (
          <>
            {imageUrls.length > 1 && (
              <div className="flex flex-wrap gap-1.5 shrink-0">
                {imageUrls.map((url, idx) => (
                  <button
                    key={url}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-colors ${
                      idx === currentImageIndex
                        ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    Image {idx + 1}
                  </button>
                ))}
              </div>
            )}

            <div
              ref={imageContainerRef}
              className={`flex-1 min-h-0 relative rounded-lg overflow-hidden bg-slate-200 border border-slate-300 ${addingStep ? 'cursor-crosshair' : ''}`}
              onClick={handleImageClick}
              data-no-drag={addingStep ? 'true' : undefined}
            >
              <img
                ref={imageRef}
                src={currentImageUrl}
                alt="Current step image"
                className="w-full h-full object-contain"
                draggable={false}
                onLoad={measureImage}
              />
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
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <ImageIcon className="w-10 h-10" />
                <p className="font-medium">Add an image to get started</p>
                <p className="text-xs">
                  PNG, JPG, GIF, or paste from clipboard
                </p>
              </div>
            )}
          </div>
        )}

        {imageError && (
          <p className="text-red-600 text-xs font-medium">{imageError}</p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
            Add image
          </button>
          <button
            onClick={() => void uploadFromClipboard()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-bold rounded-lg transition-colors text-sm"
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
              {imageUrls.length > 1 && (
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => moveImage(currentImageIndex, -1)}
                    disabled={currentImageIndex === 0}
                    className="p-1.5 text-slate-500 disabled:opacity-30 hover:bg-slate-200 rounded transition-colors"
                    aria-label="Move image earlier"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveImage(currentImageIndex, 1)}
                    disabled={currentImageIndex === imageUrls.length - 1}
                    className="p-1.5 text-slate-500 disabled:opacity-30 hover:bg-slate-200 rounded transition-colors"
                    aria-label="Move image later"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}
              <button
                onClick={() => deleteImage(currentImageIndex)}
                className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:border-red-300 hover:bg-red-50 text-slate-600 hover:text-red-600 font-bold rounded-lg transition-colors text-sm ${imageUrls.length > 1 ? '' : 'ml-auto'}`}
                aria-label="Delete current image"
              >
                <Trash2 className="w-4 h-4" />
                Delete image
              </button>
            </>
          )}
        </div>
      </div>
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
