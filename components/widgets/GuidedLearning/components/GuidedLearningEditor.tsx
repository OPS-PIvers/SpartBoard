import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  ImageIcon,
  Save,
  X,
  Loader2,
  Plus,
  Clipboard,
} from 'lucide-react';
import {
  GuidedLearningSet,
  GuidedLearningMode,
  GuidedLearningStep,
  GuidedLearningSetMetadata,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import { GuidedLearningStepEditor } from './GuidedLearningStepEditor';

interface Props {
  /** Existing set to edit, or null for new */
  existingSet: GuidedLearningSet | null;
  existingMeta: GuidedLearningSetMetadata | null;
  onSave: (set: GuidedLearningSet, driveFileId?: string) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
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
  const [imageUrl, setImageUrl] = useState(existingSet?.imageUrl ?? '');
  const [imagePath] = useState(existingSet?.imagePath ?? '');
  const [steps, setSteps] = useState<GuidedLearningStep[]>(
    existingSet?.steps ?? []
  );
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [addingStep, setAddingStep] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [imgBounds, setImgBounds] = useState<{
    offsetLeft: number;
    offsetTop: number;
    width: number;
    height: number;
  } | null>(null);

  const measureImage = useCallback(() => {
    if (!imageRef.current || !imageContainerRef.current) return;
    const imgRect = imageRef.current.getBoundingClientRect();
    const contRect = imageContainerRef.current.getBoundingClientRect();
    setImgBounds({
      offsetLeft: imgRect.left - contRect.left,
      offsetTop: imgRect.top - contRect.top,
      width: imgRect.width,
      height: imgRect.height,
    });
  }, []);

  // Handle file upload
  const handleImageUpload = async (file: File) => {
    if (!user) return;
    setImageError('');
    try {
      const url = await uploadHotspotImage(user.uid, file);
      setImageUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setImageError(msg);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImageUpload(file);
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
            await handleImageUpload(file);
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
    if (!addingStep || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const xPct = Math.max(
      2,
      Math.min(98, ((e.clientX - rect.left) / rect.width) * 100)
    );
    const yPct = Math.max(
      2,
      Math.min(98, ((e.clientY - rect.top) / rect.height) * 100)
    );

    const newStep: GuidedLearningStep = {
      id: crypto.randomUUID(),
      xPct,
      yPct,
      interactionType: 'text-popover',
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
      imageUrl,
      imagePath: imagePath || undefined,
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
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 flex-shrink-0">
        <button
          onClick={onCancel}
          className="text-slate-400 hover:text-white transition-colors"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
        <span className="text-white font-semibold text-sm flex-1 truncate">
          {existingSet ? 'Edit Set' : 'New Set'}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || uploading || !title.trim() || !imageUrl}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs rounded-lg transition-colors"
        >
          {saving || uploading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Save className="w-3 h-3" />
          )}
          Save
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-3">
          {/* Title */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Parts of a Cell"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this experience"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
            />
          </div>

          {/* Mode */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Mode</label>
            <div className="grid grid-cols-3 gap-1.5">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  className={`rounded-lg p-2 text-left border transition-colors ${
                    mode === opt.value
                      ? 'border-indigo-400 bg-indigo-500/20'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="text-white text-xs font-semibold mb-0.5">
                    {opt.label}
                  </div>
                  <div className="text-slate-400 text-xs leading-tight">
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Image upload */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Base Image *
            </label>
            {imageUrl ? (
              <div
                ref={imageContainerRef}
                className={`relative rounded-lg overflow-hidden bg-slate-800 ${addingStep ? 'cursor-crosshair' : ''}`}
                onClick={handleImageClick}
              >
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Base"
                  className="w-full object-contain max-h-48"
                  draggable={false}
                  onLoad={measureImage}
                />
                {/* Step pins overlay */}
                {steps.map((s, idx) => (
                  <div
                    key={s.id}
                    className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white text-xs rounded-full flex items-center justify-center border-2 border-white cursor-pointer select-none"
                    style={
                      imgBounds
                        ? {
                            left:
                              imgBounds.offsetLeft +
                              (s.xPct / 100) * imgBounds.width,
                            top:
                              imgBounds.offsetTop +
                              (s.yPct / 100) * imgBounds.height,
                          }
                        : { left: `${s.xPct}%`, top: `${s.yPct}%` }
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
                  <div className="absolute inset-0 bg-indigo-500/10 border-2 border-indigo-400 border-dashed rounded-lg flex items-center justify-center pointer-events-none">
                    <span className="text-indigo-200 text-sm font-semibold bg-indigo-900/70 px-3 py-1 rounded-lg">
                      Click to place hotspot
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center">
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                    <p className="text-slate-400 text-sm">Uploading…</p>
                  </div>
                ) : (
                  <>
                    <ImageIcon className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 mx-auto px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        Upload Image
                      </button>
                      <button
                        onClick={handlePaste}
                        className="flex items-center gap-1.5 mx-auto px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition-colors"
                      >
                        <Clipboard className="w-3 h-3" />
                        Paste from Clipboard
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            {imageError && (
              <p className="text-red-400 text-xs mt-1">{imageError}</p>
            )}
            {imageUrl && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Change image
                </button>
              </div>
            )}
          </div>

          {/* Steps */}
          {imageUrl && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400">
                  Steps ({steps.length})
                </label>
                <button
                  onClick={() => setAddingStep((v) => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg transition-colors ${
                    addingStep
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  {addingStep ? 'Click image…' : 'Add Step'}
                </button>
              </div>
              <div className="space-y-2">
                {steps.map((s) => (
                  <GuidedLearningStepEditor
                    key={s.id}
                    step={s}
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
                  <p className="text-slate-500 text-xs text-center py-4">
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
