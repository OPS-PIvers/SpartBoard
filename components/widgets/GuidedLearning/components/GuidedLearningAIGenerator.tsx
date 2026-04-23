import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Upload,
  Loader2,
  X,
  GripVertical,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GuidedLearningSet } from '@/types';
import {
  generateGuidedLearning,
  buildPromptWithFileContext,
  GuidedLearningImageInput,
} from '@/utils/ai';
import { useStorage } from '@/hooks/useStorage';
import { useAuth } from '@/context/useAuth';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';
import {
  DriveImagePicker,
  PickedDriveImage,
} from '@/components/common/DriveImagePicker';
import { blobToBase64 } from '@/utils/fileEncoding';
import { Z_INDEX } from '@/config/zIndex';

interface Props {
  onClose: () => void;
  onGenerated: (set: GuidedLearningSet) => void;
}

interface GeneratorImage {
  id: string;
  url: string;
  base64: string;
  mimeType: string;
  fileName: string;
  caption: string;
}

const MAX_IMAGES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB (matches HotspotImageSettings)

interface SortableImageRowProps {
  image: GeneratorImage;
  index: number;
  onCaptionChange: (id: string, caption: string) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}

const SortableImageRow: React.FC<SortableImageRowProps> = ({
  image,
  index,
  onCaptionChange,
  onRemove,
  disabled,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? Z_INDEX.itemDragging : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[auto_1fr] gap-3 p-2.5 bg-white/5 border rounded-xl ${
        isDragging
          ? 'border-brand-blue-light/60 shadow-lg opacity-80'
          : 'border-white/10'
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...(disabled ? {} : attributes)}
          {...(disabled ? {} : listeners)}
          disabled={disabled}
          className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-200 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-800 shrink-0">
          <img
            src={image.url}
            alt={image.fileName}
            className="w-full h-full object-cover"
          />
          <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-bold bg-black/60 text-white rounded">
            {index + 1}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-start gap-2">
          <span
            className="text-xs text-slate-300 font-medium truncate flex-1"
            title={image.fileName}
          >
            {image.fileName}
          </span>
          <button
            type="button"
            onClick={() => onRemove(image.id)}
            disabled={disabled}
            className="p-1 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
            aria-label="Remove image"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <textarea
          value={image.caption}
          onChange={(e) => onCaptionChange(image.id, e.target.value)}
          placeholder="Optional notes for this image…"
          rows={2}
          disabled={disabled}
          className="w-full bg-slate-900/60 border border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-brand-blue-light focus:outline-none resize-none disabled:opacity-50"
        />
      </div>
    </div>
  );
};

export const GuidedLearningAIGenerator: React.FC<Props> = ({
  onClose,
  onGenerated,
}) => {
  const { user, canAccessFeature } = useAuth();
  const { uploading, uploadHotspotImage } = useStorage();
  const [images, setImages] = useState<GeneratorImage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [error, setError] = useState('');
  const [fileContext, setFileContext] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  // Pending result + clamp-warning state. When Gemini returns steps whose
  // imageIndex referenced an image that doesn't exist, we clamp to 0 and pause
  // here so the teacher gets an explicit heads-up before the editor opens.
  const [pendingSet, setPendingSet] = useState<GuidedLearningSet | null>(null);
  const [clampWarning, setClampWarning] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || !user) return;

      const oversized = files.find((f) => f.size > MAX_FILE_BYTES);
      if (oversized) {
        setError(
          `"${oversized.name}" is larger than 10 MB. Please choose a smaller image.`
        );
        return;
      }

      const remaining = MAX_IMAGES - images.length;
      if (remaining <= 0) {
        setError(
          `You can attach at most ${MAX_IMAGES} images. Remove one before adding more.`
        );
        return;
      }

      const accepted = files.slice(0, remaining);
      if (files.length > remaining) {
        setError(
          `Only the first ${remaining} of ${files.length} images were added (max ${MAX_IMAGES} per request).`
        );
      } else {
        setError('');
      }

      setUploadingImages(true);
      try {
        const uploads = await Promise.all(
          accepted.map(async (file) => {
            const [url, base64] = await Promise.all([
              uploadHotspotImage(user.uid, file),
              blobToBase64(file),
            ]);
            return {
              id: crypto.randomUUID(),
              url,
              base64,
              mimeType: file.type || 'image/png',
              fileName: file.name || 'pasted-image',
              caption: '',
            };
          })
        );
        setImages((prev) => [...prev, ...uploads]);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Image upload failed. Please check your connection and try again.';
        setError(msg);
      } finally {
        setUploadingImages(false);
      }
    },
    [user, uploadHotspotImage, images.length]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length > 0) void addFiles(files);
  };

  // Window-level paste listener — an onPaste on the overlay <div> only fires
  // when focus happens to be inside a child input, so it made Ctrl+V unreliable.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        void addFiles(imageFiles);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/')
      );
      if (files.length > 0) void addFiles(files);
    },
    [addFiles]
  );

  const handleDriveImageAdded = useCallback((picked: PickedDriveImage) => {
    setImages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        url: picked.url,
        base64: picked.base64,
        mimeType: picked.mimeType,
        fileName: picked.fileName,
        caption: '',
      },
    ]);
  }, []);

  const handleCaptionChange = useCallback((id: string, caption: string) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, caption } : img))
    );
  }, []);

  const handleRemove = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setImages((prev) => {
      const oldIndex = prev.findIndex((img) => img.id === active.id);
      const newIndex = prev.findIndex((img) => img.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const handleGenerate = async () => {
    if (images.length === 0) return;
    // Snapshot the image order at kickoff so a late reorder or remove can't
    // desync the `imageIndex` values Gemini sees from the final `imageUrls`.
    const snapshot = images;
    setGenerating(true);
    setError('');
    try {
      const fullPrompt =
        buildPromptWithFileContext(prompt, fileContext, fileName) || undefined;
      const aiImages: GuidedLearningImageInput[] = snapshot.map((img) => ({
        base64: img.base64,
        mimeType: img.mimeType,
        caption: img.caption.trim() || undefined,
      }));
      const result = await generateGuidedLearning(aiImages, fullPrompt);
      const set: GuidedLearningSet = {
        id: crypto.randomUUID(),
        title: result.suggestedTitle,
        imageUrls: snapshot.map((img) => img.url),
        steps: result.steps,
        mode: result.suggestedMode,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isBuilding: true,
        authorUid: user?.uid,
      };
      // If any steps had their imageIndex clamped, pause so the teacher sees
      // the warning before the editor takes over the surface.
      if (result.clampedSteps.length > 0) {
        const n = result.clampedSteps.length;
        setPendingSet(set);
        setClampWarning(
          `AI suggested ${n} step${n === 1 ? '' : 's'} with image references that didn't exist — ${
            n === 1 ? 'it has' : 'they have'
          } been moved to image 1. Please review.`
        );
      } else {
        onGenerated(set);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const busy = generating || uploading || uploadingImages;

  return (
    <div
      className="absolute inset-0 z-widget-internal-overlay bg-slate-900/95 backdrop-blur-sm flex flex-col p-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
        <Sparkles className="w-4 h-4 text-brand-blue-light" />
        <span className="text-white font-semibold text-sm">
          Generate with AI
        </span>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto">
        <p className="text-slate-400 text-xs">
          Add one or more images — upload, paste, or pull from Drive. Gemini
          will analyze them together and draft a guided learning experience with
          hotspots spanning the images you provide.
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-full border-2 border-dashed border-white/20 rounded-xl py-5 text-center hover:border-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
            <span className="text-slate-300 text-xs block">
              Click to upload, drop here, or paste (Ctrl+V)
            </span>
            <span className="text-slate-500 text-[11px] mt-0.5 block">
              PNG, JPG, WebP — multi-select supported
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />

          <div className="flex flex-wrap gap-2">
            <DriveImagePicker
              onImageAdded={handleDriveImageAdded}
              disabled={busy}
              variant="dark"
              label="Add image from Drive"
            />
            {canAccessFeature('ai-file-context') && (
              <DriveFileAttachment
                onFileContent={(content, name) => {
                  setFileContext(content);
                  setFileName(name);
                }}
                disabled={busy}
                variant="dark"
                label="Attach context doc"
              />
            )}
          </div>
        </div>

        {uploadingImages && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Uploading images…
          </div>
        )}

        {images.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400">
                {images.length} image{images.length === 1 ? '' : 's'} — drag to
                reorder
              </label>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={images.map((img) => img.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-2">
                  {images.map((image, index) => (
                    <SortableImageRow
                      key={image.id}
                      image={image}
                      index={index}
                      onCaptionChange={handleCaptionChange}
                      onRemove={handleRemove}
                      disabled={busy}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Additional instructions (optional)
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="e.g. Focus on vocabulary, include 3 questions, make it for 5th grade…"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
          />
        </div>

        {error && (
          <p className="text-red-400 text-xs bg-red-900/20 px-3 py-2 rounded-lg whitespace-pre-wrap">
            {error}
          </p>
        )}

        {clampWarning && (
          <div
            role="alert"
            className="flex items-start gap-2 text-amber-200 text-xs bg-amber-900/25 border border-amber-500/30 px-3 py-2 rounded-lg"
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-300" />
            <span className="whitespace-pre-wrap">{clampWarning}</span>
          </div>
        )}
      </div>

      {pendingSet ? (
        <button
          onClick={() => {
            const set = pendingSet;
            setPendingSet(null);
            setClampWarning('');
            onGenerated(set);
          }}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-xl transition-colors font-medium text-sm"
        >
          <Sparkles className="w-4 h-4" />
          Open in editor to review
        </button>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={images.length === 0 || busy}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-colors font-medium text-sm"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Draft with AI
            </>
          )}
        </button>
      )}
    </div>
  );
};
