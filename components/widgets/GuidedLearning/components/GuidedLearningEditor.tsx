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
import { FolderSelectField } from '@/components/common/library/FolderSelectField';
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

  const {
    title,
    setTitle,
    description,
    setDescription,
    mode,
    setMode,
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
    currentImageSteps,
    folders,
    folderId,
    onFolderChange,
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
      {/* Settings strip */}
      <div className="px-5 py-4 border-b border-slate-200 space-y-3 bg-white shrink-0">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Set title (e.g. Parts of a Cell)"
          className="w-full bg-transparent border-0 text-slate-900 placeholder:text-slate-400 focus:outline-none text-lg font-bold p-0"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
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
          {folders && onFolderChange && (
            <div className="ml-auto min-w-[180px]">
              <FolderSelectField
                folders={folders}
                value={folderId ?? null}
                onChange={onFolderChange}
              />
            </div>
          )}
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
              {currentImageSteps.map((s, idx) => {
                const isSelected = s.id === selectedStepId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center cursor-pointer select-none shadow-md transition-transform ${
                      isSelected
                        ? 'bg-brand-blue-primary text-white border-2 border-white ring-2 ring-brand-blue-primary/40 scale-110'
                        : 'bg-brand-blue-primary text-white border-2 border-white hover:scale-110'
                    }`}
                    style={
                      imgBounds
                        ? {
                            left:
                              imgBounds.offsetLeft +
                              (s.xPct / 100) * imgBounds.width,
                            top:
                              imgBounds.offsetTop +
                              (s.yPct / 100) * imgBounds.height,
                            width: 24,
                            height: 24,
                            fontSize: 11,
                          }
                        : {
                            left: `${s.xPct}%`,
                            top: `${s.yPct}%`,
                            width: 24,
                            height: 24,
                            fontSize: 11,
                          }
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStepId(s.id);
                    }}
                    aria-label={`Select hotspot ${idx + 1}`}
                  >
                    {idx + 1}
                  </button>
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
    currentImageSteps,
  } = state;

  if (!selectedStep) {
    return (
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
    );
  }

  // 1-indexed position of the selected step in the full ordered list
  const stepNumber = steps.findIndex((s) => s.id === selectedStepId) + 1;

  return (
    <GuidedLearningStepEditor
      key={selectedStep.id}
      step={selectedStep}
      stepNumber={stepNumber}
      imageCount={imageUrls.length}
      onChange={updateStep}
      onDelete={() => deleteStep(selectedStep.id)}
    />
  );
};
