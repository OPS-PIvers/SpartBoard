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
          disabled={saving || uploading || !title.trim() || !imageUrl}
          className="flex items-center bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-lg transition-all active:scale-95"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
            fontSize: 'min(11px, 3cqmin)',
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

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-3" style={{ padding: 'min(12px, 3cqmin)' }}>
          {/* Title */}
          <div>
            <label
              className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
              style={{ fontSize: 'min(10px, 2.5cqmin)' }}
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

          {/* Description */}
          <div>
            <label
              className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
              style={{ fontSize: 'min(10px, 2.5cqmin)' }}
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

          {/* Mode */}
          <div>
            <label
              className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
              style={{ fontSize: 'min(10px, 2.5cqmin)' }}
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
                    style={{ fontSize: 'min(11px, 3cqmin)' }}
                  >
                    {opt.label}
                  </div>
                  <div
                    className="text-slate-400 leading-tight"
                    style={{ fontSize: 'min(9px, 2.2cqmin)' }}
                  >
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Image upload */}
          <div>
            <label
              className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
              style={{ fontSize: 'min(10px, 2.5cqmin)' }}
            >
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
                  className="w-full object-contain"
                  style={{ maxHeight: 'min(200px, 50cqh)' }}
                  draggable={false}
                  onLoad={measureImage}
                />
                {/* Step pins overlay */}
                {steps.map((s, idx) => (
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
                  <div className="absolute inset-0 bg-indigo-500/10 border-2 border-indigo-400 border-dashed rounded-lg flex items-center justify-center pointer-events-none">
                    <span
                      className="text-indigo-200 font-bold bg-indigo-900/70 rounded-lg shadow-xl"
                      style={{
                        padding: 'min(4px, 1cqmin) min(12px, 3cqmin)',
                        fontSize: 'min(12px, 3cqmin)',
                      }}
                    >
                      Click to place hotspot
                    </span>
                  </div>
                )}
              </div>
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
                      style={{ fontSize: 'min(12px, 3cqmin)' }}
                    >
                      Uploading…
                    </p>
                  </div>
                ) : (
                  <>
                    <ImageIcon
                      className="text-slate-500 mx-auto"
                      style={{
                        width: 'min(32px, 8cqmin)',
                        height: 'min(32px, 8cqmin)',
                        marginBottom: 'min(8px, 2cqmin)',
                      }}
                    />
                    <div
                      className="flex flex-col"
                      style={{ gap: 'min(8px, 2cqmin)' }}
                    >
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors"
                        style={{
                          gap: 'min(6px, 1.5cqmin)',
                          padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                          fontSize: 'min(11px, 3cqmin)',
                        }}
                      >
                        <Upload
                          style={{
                            width: 'min(12px, 3cqmin)',
                            height: 'min(12px, 3cqmin)',
                          }}
                        />
                        Upload Image
                      </button>
                      <button
                        onClick={handlePaste}
                        className="flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors"
                        style={{
                          gap: 'min(6px, 1.5cqmin)',
                          padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                          fontSize: 'min(11px, 3cqmin)',
                        }}
                      >
                        <Clipboard
                          style={{
                            width: 'min(12px, 3cqmin)',
                            height: 'min(12px, 3cqmin)',
                          }}
                        />
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
            {imageUrl && (
              <div
                className="flex"
                style={{
                  gap: 'min(8px, 2cqmin)',
                  marginTop: 'min(8px, 2cqmin)',
                }}
              >
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-slate-400 hover:text-white font-medium transition-colors"
                  style={{ fontSize: 'min(11px, 2.8cqmin)' }}
                >
                  Change image
                </button>
              </div>
            )}
          </div>

          {/* Steps */}
          {imageUrl && (
            <div>
              <div
                className="flex items-center justify-between"
                style={{ marginBottom: 'min(8px, 2cqmin)' }}
              >
                <label
                  className="text-slate-400 font-bold uppercase tracking-wider"
                  style={{ fontSize: 'min(10px, 2.5cqmin)' }}
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
                    fontSize: 'min(11px, 3cqmin)',
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
                      fontSize: 'min(11px, 3cqmin)',
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
