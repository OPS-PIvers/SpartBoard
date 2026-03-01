import React, { useState } from 'react';
import {
  ArrowLeft,
  Save,
  Trash2,
  PlusCircle,
  Sparkles,
  Loader2,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import {
  InstructionalRoutine,
  RoutineStructure,
  RoutineAudience,
} from '../../../config/instructionalRoutines';
import { IconPicker } from './IconPicker';
import { ROUTINE_COLORS, ROUTINE_STEP_COLORS } from '../../../config/colors';
import { ALL_GRADE_LEVELS } from '../../../config/widgetGradeLevels';
import { TOOLS } from '../../../config/tools';
import { WidgetType } from '../../../types';
import { httpsCallable } from 'firebase/functions';

// Derive widget types from TOOLS registry, excluding catalyst-related widgets and internal tools
const WIDGET_TYPES: WidgetType[] = TOOLS.filter(
  (tool) =>
    !tool.type.startsWith('catalyst') &&
    tool.type !== 'instructionalRoutines' &&
    tool.type !== 'record' &&
    tool.type !== 'magic'
).map((tool) => tool.type as WidgetType);
import { functions } from '../../../config/firebase';
import { useAuth } from '../../../context/useAuth';
import { useStorage } from '../../../hooks/useStorage';
import {
  removeBackground,
  trimImageWhitespace,
} from '../../../utils/imageProcessing';
import { PromptDialog } from './PromptDialog';
import { Toast } from '../../common/Toast';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

interface LibraryManagerProps {
  routine: InstructionalRoutine;
  onChange: (routine: InstructionalRoutine) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const LibraryManager: React.FC<LibraryManagerProps> = ({
  routine,
  onChange,
  onSave,
  onCancel,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { user } = useAuth();
  const { uploadSticker, uploadDisplayImage } = useStorage();
  const [uploadingStickerIndex, setUploadingStickerIndex] = useState<
    number | null
  >(null);
  const [uploadingImageIndex, setUploadingImageIndex] = useState<number | null>(
    null
  );
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleMagicDesign = async (prompt: string) => {
    setIsGenerating(true);
    try {
      const generate = httpsCallable(functions, 'generateWithAI');
      const result = await generate({
        type: 'instructional-routine',
        prompt,
      });

      const data = result.data as Partial<InstructionalRoutine>;

      // Preserve ID but overwrite other fields
      onChange({
        ...routine,
        name: data.name ?? routine.name,
        grades: (data.grades as string) ?? routine.grades,
        icon: data.icon ?? routine.icon,
        color: data.color ?? routine.color,
        steps:
          data.steps?.map((s) => ({
            ...s,
            stickerUrl: undefined, // Ensure type compatibility
          })) ?? routine.steps,
      });
    } catch (error) {
      console.error('Magic Design failed:', error);
      setErrorMessage('Failed to generate routine. Please try again.');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageUpload = async (
    file: File,
    index: number,
    type: 'sticker' | 'display'
  ) => {
    if (!user || !file) return;

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setErrorMessage(
        'The selected image is too large. Please choose an image smaller than 5MB.'
      );
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    const setUploading =
      type === 'sticker' ? setUploadingStickerIndex : setUploadingImageIndex;
    setUploading(index);

    setProcessingMessage(
      type === 'sticker'
        ? 'Processing sticker... This may take a few seconds for large images.'
        : 'Uploading display image...'
    );

    try {
      let finalFile = file;

      if (type === 'sticker') {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const noBg = await removeBackground(dataUrl);
        const trimmed = await trimImageWhitespace(noBg);

        setProcessingMessage('Uploading sticker...');
        const response = await fetch(trimmed);
        const blob = await response.blob();
        finalFile = new File(
          [blob],
          file.name.replace(/\.[^/.]+$/, '') + '.png',
          {
            type: 'image/png',
          }
        );
      }

      const url =
        type === 'sticker'
          ? await uploadSticker(user.uid, finalFile)
          : await uploadDisplayImage(user.uid, finalFile);

      const nextSteps = [...routine.steps];
      nextSteps[index] = {
        ...nextSteps[index],
        [type === 'sticker' ? 'stickerUrl' : 'imageUrl']: url,
      };
      onChange({ ...routine, steps: nextSteps });
      setProcessingMessage(null);
    } catch (e) {
      console.error(`${type} upload failed:`, e);
      setErrorMessage(
        `Failed to upload ${type}. Please check your image and try again.`
      );
      setTimeout(() => setErrorMessage(null), 3000);
      setProcessingMessage(null);
    } finally {
      setUploading(null);
    }
  };

  const handleStickerUpload = (file: File, index: number) =>
    handleImageUpload(file, index, 'sticker');

  const handleDisplayImageUpload = (file: File, index: number) =>
    handleImageUpload(file, index, 'display');

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onCancel}
          className="p-1 hover:bg-slate-200 rounded-full"
        >
          <ArrowLeft size={18} />
        </button>
        <h3 className="font-black text-xs uppercase tracking-widest text-slate-500 flex-1">
          {routine.id ? 'Edit Routine Template' : 'Add New Routine'}
        </h3>
        <button
          onClick={() => setShowPromptDialog(true)}
          disabled={isGenerating}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-xxs font-black uppercase tracking-wider hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 transition-all shadow-sm"
        >
          {isGenerating ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          Magic Design
        </button>
        <button
          onClick={onSave}
          disabled={!routine.name}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xxs font-black uppercase tracking-wider hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={14} />
          Save to Library
        </button>
      </div>

      <div className="space-y-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xxxs font-black uppercase text-slate-400 ml-1">
              Routine Name
            </label>
            <input
              type="text"
              value={routine.name}
              onChange={(e) =>
                onChange({
                  ...routine,
                  name: e.target.value,
                })
              }
              placeholder="e.g. Think-Pair-Share"
              className="w-full bg-slate-50 border-none rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1 text-left">
            <label className="text-xxxs font-black uppercase text-slate-400 ml-1">
              Main Icon & Color
            </label>
            <div className="flex gap-2">
              <IconPicker
                currentIcon={routine.icon}
                onSelect={(icon) =>
                  onChange({
                    ...routine,
                    icon,
                  })
                }
              />
              <select
                value={routine.color ?? 'blue'}
                onChange={(e) =>
                  onChange({
                    ...routine,
                    color: e.target.value,
                  })
                }
                className="bg-slate-50 border-none rounded-xl px-2 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 flex-1"
              >
                {ROUTINE_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xxxs font-black uppercase text-slate-400 ml-1">
              Structure, Audience & Layout
            </label>
            <div className="flex gap-2">
              <select
                value={routine.structure ?? 'linear'}
                onChange={(e) =>
                  onChange({
                    ...routine,
                    structure: e.target.value as RoutineStructure,
                  })
                }
                className="bg-slate-50 border-none rounded-xl px-2 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 flex-1"
              >
                <option value="linear">Linear Steps</option>
                <option value="cycle">Cycle Process</option>
                <option value="visual-cue">Visual Cues</option>
                <option value="components">Components</option>
              </select>
              <select
                value={routine.audience ?? 'student'}
                onChange={(e) =>
                  onChange({
                    ...routine,
                    audience: e.target.value as RoutineAudience,
                  })
                }
                className="bg-slate-50 border-none rounded-xl px-2 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 flex-1"
              >
                <option value="student">For Students</option>
                <option value="teacher">For Teachers</option>
              </select>
              <select
                value={routine.layout ?? 'list'}
                onChange={(e) =>
                  onChange({
                    ...routine,
                    layout: e.target.value as 'list' | 'grid' | 'hero',
                  })
                }
                className="bg-slate-50 border-none rounded-xl px-2 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 flex-1"
              >
                <option value="list">List Layout</option>
                <option value="grid">Grid Layout</option>
                <option value="hero">Hero Layout</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xxxs font-black uppercase text-slate-400 ml-1">
              Grade Levels
            </label>
            <div className="flex flex-wrap gap-1">
              {ALL_GRADE_LEVELS.map((level) => {
                const isSelected = routine.gradeLevels?.includes(level);
                return (
                  <button
                    key={level}
                    onClick={() => {
                      const current = routine.gradeLevels ?? [];
                      const next = isSelected
                        ? current.filter((l) => l !== level)
                        : [...current, level];

                      // Auto-update grades string for legacy support
                      let gradesStr = 'Universal';
                      if (
                        next.length > 0 &&
                        next.length < ALL_GRADE_LEVELS.length
                      ) {
                        gradesStr = next
                          .map((l) => l.toUpperCase())
                          .sort()
                          .join(', ');
                      } else if (next.length === 0) {
                        gradesStr = 'None';
                      }

                      onChange({
                        ...routine,
                        gradeLevels: next,
                        grades: gradesStr,
                      });
                    }}
                    className={`px-2 py-1 rounded-lg text-xxs font-black uppercase transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t">
          <label className="text-xxs font-black uppercase text-slate-400 tracking-widest block mb-2">
            Default Steps
          </label>
          {routine.steps.map((step, i) => (
            <div
              key={i}
              className="flex gap-2 items-center bg-slate-50 p-3 rounded-xl border border-slate-100 group"
            >
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <IconPicker
                    currentIcon={step.icon ?? 'Zap'}
                    color={step.color}
                    onSelect={(icon) => {
                      const nextSteps = [...routine.steps];
                      nextSteps[i] = { ...step, icon };
                      onChange({
                        ...routine,
                        steps: nextSteps,
                      });
                    }}
                  />
                  <div className="flex items-center gap-1">
                    <label
                      className="cursor-pointer p-1.5 hover:bg-slate-100 rounded-lg border border-transparent hover:border-slate-200 transition-colors relative group/upload"
                      title="Upload custom sticker (transparent background)"
                    >
                      {uploadingStickerIndex === i ? (
                        <Loader2
                          size={16}
                          className="animate-spin text-blue-500"
                        />
                      ) : step.stickerUrl ? (
                        <div className="relative">
                          <img
                            src={step.stickerUrl}
                            alt="Sticker"
                            className="w-6 h-6 object-contain"
                          />
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const next = [...routine.steps];
                              next[i] = { ...next[i], stickerUrl: undefined };
                              onChange({ ...routine, steps: next });
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/upload:opacity-100 transition-opacity"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <Sparkles
                          size={16}
                          className="text-slate-400 group-hover/upload:text-blue-500"
                        />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0])
                            void handleStickerUpload(e.target.files[0], i);
                        }}
                        disabled={
                          uploadingStickerIndex !== null ||
                          uploadingImageIndex !== null
                        }
                      />
                    </label>

                    <label
                      className="cursor-pointer p-1.5 hover:bg-slate-100 rounded-lg border border-transparent hover:border-slate-200 transition-colors relative group/upload-img"
                      title="Upload display image"
                    >
                      {uploadingImageIndex === i ? (
                        <Loader2
                          size={16}
                          className="animate-spin text-blue-500"
                        />
                      ) : step.imageUrl ? (
                        <div className="relative">
                          <img
                            src={step.imageUrl}
                            alt="Display"
                            className="w-6 h-6 object-cover rounded"
                          />
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const next = [...routine.steps];
                              next[i] = { ...next[i], imageUrl: undefined };
                              onChange({ ...routine, steps: next });
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/upload-img:opacity-100 transition-opacity"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <ImageIcon
                          size={16}
                          className="text-slate-400 group-hover/upload-img:text-blue-500"
                        />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0])
                            void handleDisplayImageUpload(e.target.files[0], i);
                        }}
                        disabled={
                          uploadingStickerIndex !== null ||
                          uploadingImageIndex !== null
                        }
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    value={step.label ?? ''}
                    onChange={(e) => {
                      const nextSteps = [...routine.steps];
                      nextSteps[i] = { ...step, label: e.target.value };
                      onChange({
                        ...routine,
                        steps: nextSteps,
                      });
                    }}
                    placeholder="Label"
                    className="w-16 bg-white border-none rounded px-2 py-0.5 text-xxs font-bold text-emerald-600"
                  />
                  <select
                    value={step.color ?? 'blue'}
                    onChange={(e) => {
                      const nextSteps = [...routine.steps];
                      nextSteps[i] = { ...step, color: e.target.value };
                      onChange({
                        ...routine,
                        steps: nextSteps,
                      });
                    }}
                    className="bg-white border-none rounded px-2 py-0.5 text-xxs font-bold text-slate-600"
                  >
                    {ROUTINE_STEP_COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={step.text}
                  onChange={(e) => {
                    const nextSteps = [...routine.steps];
                    nextSteps[i] = { ...step, text: e.target.value };
                    onChange({
                      ...routine,
                      steps: nextSteps,
                    });
                  }}
                  rows={1}
                  placeholder="Instruction text..."
                  className="w-full text-xxs font-bold bg-white border-none rounded-lg px-2 py-1 leading-tight resize-none text-slate-800"
                />
                <div className="flex items-center gap-2 mt-1 bg-white/50 p-1.5 rounded-lg border border-slate-100">
                  <label className="text-xxxs font-black text-slate-400 uppercase tracking-widest">
                    Connect Widget:
                  </label>
                  <select
                    value={step.attachedWidget?.type ?? ''}
                    onChange={(e) => {
                      const nextSteps = [...routine.steps];
                      const val = e.target.value;
                      if (!val) {
                        nextSteps[i] = { ...step, attachedWidget: undefined };
                      } else {
                        const tool = TOOLS.find((t) => t.type === val);
                        nextSteps[i] = {
                          ...step,
                          attachedWidget: {
                            type: val,
                            label: tool?.label ?? val,
                          },
                        };
                      }
                      onChange({ ...routine, steps: nextSteps });
                    }}
                    className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xxs font-bold text-slate-700 flex-1"
                  >
                    <option value="">None</option>
                    {WIDGET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TOOLS.find((tool) => tool.type === t)?.label ?? t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={() => {
                  const nextSteps = routine.steps.filter((_, idx) => idx !== i);
                  onChange({
                    ...routine,
                    steps: nextSteps,
                  });
                }}
                className="p-2 text-red-400 hover:bg-red-50 rounded-lg"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const nextSteps = [
                ...routine.steps,
                { text: '', icon: 'Zap', color: 'blue', label: 'Step' },
              ];
              onChange({
                ...routine,
                steps: nextSteps,
              });
            }}
            className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-all flex items-center justify-center gap-2 text-xxs font-black uppercase"
          >
            <PlusCircle size={14} /> Add Template Step
          </button>
        </div>
      </div>

      {/* Processing Message */}
      {processingMessage && (
        <Toast message={processingMessage} type="loading" />
      )}

      {/* Error Message */}
      {errorMessage && (
        <Toast
          message={errorMessage}
          type="error"
          onClose={() => setErrorMessage(null)}
        />
      )}

      {/* Magic Design Prompt Dialog */}
      {showPromptDialog && (
        <PromptDialog
          title="Magic Design"
          message="Describe the instructional routine you want to create"
          placeholder='e.g., "A 3-step routine for peer review where students swap papers twice"'
          confirmLabel="Generate"
          cancelLabel="Cancel"
          onConfirm={(prompt) => {
            setShowPromptDialog(false);
            void handleMagicDesign(prompt);
          }}
          onCancel={() => setShowPromptDialog(false)}
        />
      )}
    </div>
  );
};
