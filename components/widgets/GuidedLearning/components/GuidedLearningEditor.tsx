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
  Save,
  X,
  Loader2,
  Plus,
  Clipboard,
  ChevronUp,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import {
  GuidedLearningSet,
  GuidedLearningMode,
  GuidedLearningStep,
  GuidedLearningSetMetadata,
  LibraryFolder,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import { FolderSelectField } from '@/components/common/library/FolderSelectField';
import { GuidedLearningStepEditor } from './GuidedLearningStepEditor';
import { calculateImageFootprint } from '../utils/imageUtils';

/** State emitted by `onStateChange` so a parent modal can track dirty state. */
export interface GuidedLearningEditorState {
  title: string;
  description: string;
  mode: GuidedLearningMode;
  imageUrls: string[];
  steps: GuidedLearningStep[];
  uploading: boolean;
}

interface Props {
  /** Existing set to edit, or null for new */
  existingSet: GuidedLearningSet | null;
  existingMeta: GuidedLearningSetMetadata | null;
  onSave: (set: GuidedLearningSet, driveFileId?: string) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  /** When true, hides the built-in header (Cancel/Save bar) — the parent modal provides chrome. */
  headless?: boolean;
  /** Fires whenever editable fields change so a parent modal can compute isDirty. */
  onStateChange?: (state: GuidedLearningEditorState) => void;
  /** Optional folder picker. When `folders` and `onFolderChange` are both provided, a folder-select field is shown. */
  folders?: LibraryFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
}

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

export const GuidedLearningEditor: React.FC<Props> = ({
  existingSet,
  existingMeta,
  onSave,
  onCancel,
  saving,
  headless,
  onStateChange,
  folders,
  folderId,
  onFolderChange,
}) => {
  const { user } = useAuth();
  const { uploading, uploadHotspotImage } = useStorage();

  const [title, setTitle] = useState(existingSet?.title ?? '');
  const [description, setDescription] = useState(
    existingSet?.description ?? ''
  );
  const [mode, setMode] = useState<GuidedLearningMode>(
    existingSet?.mode ?? 'structured'
  );
  const [imageUrls, setImageUrls] = useState<string[]>(
    existingSet?.imageUrls ?? []
  );
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [steps, setSteps] = useState<GuidedLearningStep[]>(
    existingSet?.steps ?? []
  );
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [addingStep, setAddingStep] = useState(false);

  // Notify parent modal of state changes for dirty-check computation
  useEffect(() => {
    onStateChange?.({ title, description, mode, imageUrls, steps, uploading });
  }, [title, description, mode, imageUrls, steps, uploading, onStateChange]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const currentImageUrl = imageUrls[currentImageIndex] ?? '';
  const currentImageSteps = useMemo(
    () => steps.filter((step) => step.imageIndex === currentImageIndex),
    [steps, currentImageIndex]
  );

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
    const ro = new ResizeObserver(() => {
      measureImage();
    });
    ro.observe(imageContainerRef.current);
    return () => ro.disconnect();
  }, [currentImageUrl, measureImage]);

  const uploadImages = async (files: File[]) => {
    if (!user || files.length === 0) return;
    setImageError('');

    try {
      const uploadedUrls = await Promise.all(
        files.map((file) => uploadHotspotImage(user.uid, file))
      );
      if (uploadedUrls.length > 0) {
        setImageUrls((prev) => [...prev, ...uploadedUrls]);
        setCurrentImageIndex((prev) =>
          Math.max(prev, imageUrls.length + uploadedUrls.length - 1)
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setImageError(msg);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    await uploadImages(files);
    e.target.value = '';
  };

  const handleDeleteImage = (deleteIndex: number) => {
    const updatedImageUrls = imageUrls.filter(
      (_, index) => index !== deleteIndex
    );
    setImageUrls(updatedImageUrls);
    setCurrentImageIndex((curr) => {
      if (updatedImageUrls.length === 0) return 0;
      if (curr === deleteIndex)
        return Math.min(deleteIndex, updatedImageUrls.length - 1);
      if (curr > deleteIndex) return curr - 1;
      return curr;
    });

    setSteps((prev) =>
      prev
        .filter((step) => step.imageIndex !== deleteIndex)
        .map((step) => ({
          ...step,
          imageIndex:
            step.imageIndex > deleteIndex
              ? step.imageIndex - 1
              : step.imageIndex,
        }))
    );
  };

  const handleMoveImage = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= imageUrls.length) return;

    setImageUrls((prev) => {
      const updated = [...prev];
      [updated[fromIndex], updated[toIndex]] = [
        updated[toIndex],
        updated[fromIndex],
      ];
      return updated;
    });

    setSteps((prev) =>
      prev.map((step) => {
        if (step.imageIndex === fromIndex)
          return { ...step, imageIndex: toIndex };
        if (step.imageIndex === toIndex)
          return { ...step, imageIndex: fromIndex };
        return step;
      })
    );

    setCurrentImageIndex((prev) => {
      if (prev === fromIndex) return toIndex;
      if (prev === toIndex) return fromIndex;
      return prev;
    });
  };

  // Paste from clipboard
  const handlePaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], 'pasted-image.png', { type });
            await uploadImages([file]);
            return;
          }
        }
      }
      setImageError('No image found in clipboard.');
    } catch {
      setImageError(
        'Could not read clipboard. Try using the file upload instead.'
      );
    }
  };

  // Click on image to add a step
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

    const newStep: GuidedLearningStep = {
      id: crypto.randomUUID(),
      xPct,
      yPct,
      imageIndex: currentImageIndex,
      interactionType: 'text-popover',
      showOverlay: 'none',
      text: '',
    };
    setSteps((prev) => [...prev, newStep]);
    setExpandedStepId(newStep.id);
    setAddingStep(false);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    const now = Date.now();
    const setId = existingSet?.id ?? crypto.randomUUID();
    const set: GuidedLearningSet = {
      id: setId,
      title: title.trim(),
      description: description.trim() || undefined,
      imageUrls,
      steps,
      mode,
      createdAt: existingSet?.createdAt ?? now,
      updatedAt: now,
      authorUid: user?.uid,
    };
    await onSave(set, existingMeta?.driveFileId);
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {!headless && (
        <div
          className="flex items-center border-b border-white/10 flex-shrink-0"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
          }}
        >
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Cancel"
          >
            <X
              style={{
                width: 'min(16px, 4cqmin)',
                height: 'min(16px, 4cqmin)',
              }}
            />
          </button>
          <span
            className="text-white font-bold flex-1 truncate"
            style={{ fontSize: 'min(14px, 4cqmin)' }}
          >
            {existingSet ? 'Edit Set' : 'New Set'}
          </span>
          <button
            onClick={handleSave}
            disabled={
              saving || uploading || !title.trim() || imageUrls.length === 0
            }
            className="flex items-center bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-lg transition-all active:scale-95"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
              fontSize: 'clamp(11px, 3cqmin, 16px)',
            }}
          >
            {saving || uploading ? (
              <Loader2
                className="animate-spin"
                style={{
                  width: 'min(12px, 3cqmin)',
                  height: 'min(12px, 3cqmin)',
                }}
              />
            ) : (
              <Save
                style={{
                  width: 'min(12px, 3cqmin)',
                  height: 'min(12px, 3cqmin)',
                }}
              />
            )}
            Save
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-3" style={{ padding: 'min(12px, 3cqmin)' }}>
          <div>
            <label
              className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
              style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
            >
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Parts of a Cell"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              style={{
                padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                fontSize: 'min(13px, 3.5cqmin)',
              }}
            />
          </div>

          <div>
            <label
              className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
              style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
            >
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this experience"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              style={{
                padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                fontSize: 'min(12px, 3.2cqmin)',
              }}
            />
          </div>

          {folders && onFolderChange && (
            <FolderSelectField
              folders={folders}
              value={folderId ?? null}
              onChange={onFolderChange}
            />
          )}

          <div>
            <label
              className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
              style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
            >
              Mode
            </label>
            <div
              className="grid grid-cols-3"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  className={`rounded-lg text-left border transition-all active:scale-95 ${
                    mode === opt.value
                      ? 'border-indigo-400 bg-indigo-500/20'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                  style={{ padding: 'min(8px, 2cqmin)' }}
                >
                  <div
                    className="text-white font-bold mb-0.5"
                    style={{ fontSize: 'clamp(11px, 3cqmin, 16px)' }}
                  >
                    {opt.label}
                  </div>
                  <div
                    className="text-slate-400 leading-tight"
                    style={{ fontSize: 'clamp(9px, 2.2cqmin, 12px)' }}
                  >
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
              style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
            >
              Images *
            </label>

            {currentImageUrl ? (
              <>
                <div
                  className="flex flex-wrap"
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    marginBottom: 'min(8px, 2cqmin)',
                  }}
                >
                  {imageUrls.map((url, idx) => (
                    <button
                      key={url}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`border rounded px-2 py-1 text-xs ${idx === currentImageIndex ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10' : 'border-white/20 text-slate-300'}`}
                    >
                      Image {idx + 1}
                    </button>
                  ))}
                </div>

                <div
                  ref={imageContainerRef}
                  className={`relative rounded-lg overflow-hidden bg-slate-800 ${addingStep ? 'cursor-crosshair' : ''}`}
                  onClick={handleImageClick}
                  data-no-drag={addingStep ? 'true' : undefined}
                  style={{ height: 'min(600px, 50cqh)' }}
                >
                  <img
                    ref={imageRef}
                    src={currentImageUrl}
                    alt="Current step image"
                    className="w-full h-full object-contain"
                    draggable={false}
                    onLoad={measureImage}
                  />
                  {currentImageSteps.map((s, idx) => (
                    <div
                      key={s.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white rounded-full flex items-center justify-center border-2 border-white cursor-pointer select-none shadow-md"
                      style={
                        imgBounds
                          ? {
                              left:
                                imgBounds.offsetLeft +
                                (s.xPct / 100) * imgBounds.width,
                              top:
                                imgBounds.offsetTop +
                                (s.yPct / 100) * imgBounds.height,
                              width: 'min(20px, 5cqmin)',
                              height: 'min(20px, 5cqmin)',
                              fontSize: 'min(10px, 2.5cqmin)',
                            }
                          : {
                              left: `${s.xPct}%`,
                              top: `${s.yPct}%`,
                              width: 'min(20px, 5cqmin)',
                              height: 'min(20px, 5cqmin)',
                              fontSize: 'min(10px, 2.5cqmin)',
                            }
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedStepId((prev) =>
                          prev === s.id ? null : s.id
                        );
                      }}
                    >
                      {idx + 1}
                    </div>
                  ))}
                  {addingStep && (
                    <div
                      className="absolute bg-indigo-500/10 border-2 border-indigo-400 border-dashed rounded-lg flex items-center justify-center pointer-events-none"
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
                      <span
                        className="text-indigo-200 font-bold bg-indigo-900/70 rounded-lg shadow-xl"
                        style={{
                          padding: 'min(4px, 1cqmin) min(12px, 3cqmin)',
                          fontSize: 'clamp(12px, 3cqmin, 16px)',
                        }}
                      >
                        Click to place hotspot
                      </span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div
                className="border-2 border-dashed border-white/20 rounded-xl text-center"
                style={{ padding: 'min(24px, 6cqmin)' }}
              >
                {uploading ? (
                  <div
                    className="flex flex-col items-center"
                    style={{ gap: 'min(8px, 2cqmin)' }}
                  >
                    <Loader2
                      className="text-indigo-400 animate-spin"
                      style={{
                        width: 'min(32px, 8cqmin)',
                        height: 'min(32px, 8cqmin)',
                      }}
                    />
                    <p
                      className="text-slate-400 font-medium"
                      style={{ fontSize: 'clamp(12px, 3cqmin, 16px)' }}
                    >
                      Uploading…
                    </p>
                  </div>
                ) : (
                  <ImageIcon
                    className="text-slate-500 mx-auto"
                    style={{
                      width: 'min(32px, 8cqmin)',
                      height: 'min(32px, 8cqmin)',
                      marginBottom: 'min(8px, 2cqmin)',
                    }}
                  />
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            <div
              className="flex flex-wrap"
              style={{ gap: 'min(8px, 2cqmin)', marginTop: 'min(8px, 2cqmin)' }}
            >
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors"
                style={{
                  gap: 'min(6px, 1.5cqmin)',
                  padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                  fontSize: 'clamp(11px, 3cqmin, 16px)',
                }}
              >
                <Upload
                  style={{
                    width: 'min(12px, 3cqmin)',
                    height: 'min(12px, 3cqmin)',
                  }}
                />
                Add Image(s)
              </button>
              <button
                onClick={handlePaste}
                className="flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors"
                style={{
                  gap: 'min(6px, 1.5cqmin)',
                  padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                  fontSize: 'clamp(11px, 3cqmin, 16px)',
                }}
              >
                <Clipboard
                  style={{
                    width: 'min(12px, 3cqmin)',
                    height: 'min(12px, 3cqmin)',
                  }}
                />
                Paste Image
              </button>
              {imageUrls.length > 0 && (
                <button
                  onClick={() => handleDeleteImage(currentImageIndex)}
                  className="flex items-center justify-center bg-red-700/80 hover:bg-red-600 text-white font-bold rounded-lg transition-colors"
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                    fontSize: 'clamp(11px, 3cqmin, 16px)',
                  }}
                >
                  <Trash2
                    style={{
                      width: 'min(12px, 3cqmin)',
                      height: 'min(12px, 3cqmin)',
                    }}
                  />
                  Delete Current Image
                </button>
              )}
            </div>

            {imageUrls.length > 1 && (
              <div
                className="flex items-center"
                style={{
                  gap: 'min(8px, 2cqmin)',
                  marginTop: 'min(8px, 2cqmin)',
                }}
              >
                <button
                  onClick={() => handleMoveImage(currentImageIndex, -1)}
                  disabled={currentImageIndex === 0}
                  className="text-slate-300 disabled:opacity-40"
                >
                  <ChevronUp
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                </button>
                <button
                  onClick={() => handleMoveImage(currentImageIndex, 1)}
                  disabled={currentImageIndex === imageUrls.length - 1}
                  className="text-slate-300 disabled:opacity-40"
                >
                  <ChevronDown
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                </button>
                <span className="text-slate-400 text-xs">
                  Reorder current image
                </span>
              </div>
            )}

            {imageError && (
              <p
                className="text-red-400 font-medium"
                style={{
                  fontSize: 'min(11px, 2.8cqmin)',
                  marginTop: 'min(4px, 1cqmin)',
                }}
              >
                {imageError}
              </p>
            )}
          </div>

          {imageUrls.length > 0 && (
            <div>
              <div
                className="flex items-center justify-between"
                style={{ marginBottom: 'min(8px, 2cqmin)' }}
              >
                <label
                  className="text-slate-400 font-bold uppercase tracking-wider"
                  style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
                >
                  Steps ({steps.length})
                </label>
                <button
                  onClick={() => setAddingStep((v) => !v)}
                  className={`flex items-center font-bold rounded-lg transition-colors ${
                    addingStep
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                  style={{
                    gap: 'min(4px, 1cqmin)',
                    padding: 'min(4px, 1cqmin) min(10px, 2.5cqmin)',
                    fontSize: 'clamp(11px, 3cqmin, 16px)',
                  }}
                >
                  <Plus
                    style={{
                      width: 'min(12px, 3cqmin)',
                      height: 'min(12px, 3cqmin)',
                    }}
                  />
                  {addingStep ? 'Click image…' : 'Add Step'}
                </button>
              </div>

              <div className="space-y-2">
                {steps.map((s) => (
                  <GuidedLearningStepEditor
                    key={s.id}
                    step={s}
                    imageCount={imageUrls.length}
                    onChange={(updated) =>
                      setSteps((prev) =>
                        prev.map((x) => (x.id === updated.id ? updated : x))
                      )
                    }
                    onDelete={() =>
                      setSteps((prev) => prev.filter((x) => x.id !== s.id))
                    }
                    isExpanded={expandedStepId === s.id}
                    onToggle={() =>
                      setExpandedStepId((prev) => (prev === s.id ? null : s.id))
                    }
                  />
                ))}
                {steps.length === 0 && (
                  <p
                    className="text-slate-500 font-medium text-center"
                    style={{
                      padding: 'min(16px, 4cqmin) 0',
                      fontSize: 'clamp(11px, 3cqmin, 16px)',
                    }}
                  >
                    Click &quot;Add Step&quot; then click the image to place a
                    hotspot.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
