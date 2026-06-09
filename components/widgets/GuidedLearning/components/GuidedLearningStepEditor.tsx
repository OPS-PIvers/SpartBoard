import React, { useRef, useState } from 'react';
import { Loader2, Plus, Trash2, Upload } from 'lucide-react';
import {
  GuidedLearningStep,
  GuidedLearningInteractionType,
  GuidedLearningQuestionType,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';

interface Props {
  step: GuidedLearningStep;
  /** 1-indexed position of this step among all steps. Shown in the header. */
  stepNumber: number;
  imageCount: number;
  onChange: (updated: GuidedLearningStep) => void;
  onDelete: () => void;
}

const INTERACTION_TYPES: {
  value: GuidedLearningInteractionType;
  label: string;
}[] = [
  { value: 'text-popover', label: 'Text Popover' },
  { value: 'tooltip', label: 'Tooltip' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'pan-zoom', label: 'Pan & Zoom' },
  { value: 'pan-zoom-spotlight', label: 'Pan & Zoom + Spotlight' },
  { value: 'spotlight', label: 'Spotlight' },
  { value: 'question', label: 'Question' },
];

const QUESTION_TYPES: { value: GuidedLearningQuestionType; label: string }[] = [
  { value: 'multiple-choice', label: 'Multiple Choice' },
  { value: 'matching', label: 'Matching' },
  { value: 'sorting', label: 'Sorting' },
];

const TOOLTIP_POSITIONS: NonNullable<GuidedLearningStep['tooltipPosition']>[] =
  ['auto', 'above', 'below', 'left', 'right'];

const BANNER_TONES: NonNullable<GuidedLearningStep['bannerTone']>[] = [
  'blue',
  'red',
  'neutral',
];

const labelClass =
  'block text-slate-600 font-bold uppercase tracking-wider mb-1 text-xs';
const inputClass =
  'w-full bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary px-3 py-2 text-sm';
const selectClass = `${inputClass} appearance-none`;

export const GuidedLearningStepEditor: React.FC<Props> = ({
  step,
  stepNumber,
  imageCount,
  onChange,
  onDelete,
}) => {
  const update = (patch: Partial<GuidedLearningStep>) =>
    onChange({ ...step, ...patch });

  const interactionLabel =
    INTERACTION_TYPES.find((t) => t.value === step.interactionType)?.label ??
    step.interactionType;

  const trimmedLabel = step.label?.trim() ?? '';
  const headerLabel =
    trimmedLabel.length > 0 ? trimmedLabel : `Hotspot ${stepNumber}`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-white sticky top-0">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">
            Step {stepNumber}
            <span className="mx-1.5">·</span>
            {interactionLabel}
            <span className="mx-1.5">·</span>
            <span className="font-mono normal-case tracking-normal">
              {step.xPct.toFixed(0)}%, {step.yPct.toFixed(0)}%
            </span>
          </div>
          <h4 className="text-base font-bold text-slate-900 truncate mt-0.5">
            {headerLabel}
          </h4>
        </div>
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors px-3 py-1.5 rounded-lg text-xs font-bold"
          aria-label="Delete step"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">
        {/* Label */}
        <div>
          <label className={labelClass}>Label (optional)</label>
          <input
            type="text"
            value={step.label ?? ''}
            onChange={(e) => update({ label: e.target.value })}
            placeholder="Step title or caption"
            className={inputClass}
          />
        </div>

        {/* Interaction type */}
        <div>
          <label className={labelClass}>Interaction Type</label>
          <select
            value={step.interactionType}
            onChange={(e) =>
              update({
                interactionType: e.target
                  .value as GuidedLearningInteractionType,
              })
            }
            className={selectClass}
          >
            {INTERACTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {imageCount >= 2 && (
          <div>
            <label className={labelClass}>Slide</label>
            <select
              value={step.imageIndex}
              onChange={(e) =>
                update({ imageIndex: parseInt(e.target.value, 10) || 0 })
              }
              className={selectClass}
            >
              {Array.from({ length: imageCount }, (_, i) => (
                <option key={i} value={i}>
                  Slide {i + 1}
                </option>
              ))}
            </select>
          </div>
        )}

        <label
          className="flex items-start gap-2 text-sm text-slate-700"
          title="When on, the hotspot marker is never rendered in the player. In explore mode the underlying image region is still clickable, so this is useful for 'find the click zone' exercises where the marker would give it away. In structured/guided mode the marker is auto-hidden anyway while a step is live; this option just suppresses the brief flash before the interaction renders."
        >
          <input
            type="checkbox"
            checked={Boolean(step.hotspotAlwaysHidden ?? step.hideStepNumber)}
            onChange={(e) => update({ hotspotAlwaysHidden: e.target.checked })}
            className="accent-brand-blue-primary w-4 h-4 mt-0.5"
          />
          <span>
            Always hide hotspot marker
            <span className="block text-xxs font-medium text-slate-500 mt-0.5">
              Marker never appears. Useful for &quot;find the click zone&quot;
              exercises in explore mode.
            </span>
          </span>
        </label>

        {/* Text content */}
        {(step.interactionType === 'text-popover' ||
          step.interactionType === 'tooltip') && (
          <div>
            <label className={labelClass}>Text Content</label>
            <textarea
              value={step.text ?? ''}
              onChange={(e) => update({ text: e.target.value })}
              rows={4}
              placeholder="Enter the text to display…"
              className={`${inputClass} resize-none`}
            />
          </div>
        )}

        {step.interactionType === 'tooltip' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tooltip Position</label>
              <select
                value={step.tooltipPosition ?? 'auto'}
                onChange={(e) =>
                  update({
                    tooltipPosition: e.target
                      .value as GuidedLearningStep['tooltipPosition'],
                  })
                }
                className={selectClass}
              >
                {TOOLTIP_POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {position[0].toUpperCase() + position.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Tooltip Offset ({step.tooltipOffset ?? 12}px)
              </label>
              <input
                type="range"
                min={0}
                max={48}
                step={2}
                value={step.tooltipOffset ?? 12}
                onChange={(e) =>
                  update({ tooltipOffset: parseInt(e.target.value, 10) })
                }
                className="w-full accent-brand-blue-primary"
              />
            </div>
          </div>
        )}

        {/* Audio: upload or external URL */}
        {step.interactionType === 'audio' && (
          <div>
            <label className={labelClass}>Audio</label>
            <input
              type="url"
              value={step.audioUrl ?? ''}
              onChange={(e) =>
                update({
                  audioUrl: e.target.value,
                  audioStoragePath: undefined,
                })
              }
              placeholder="Paste an audio URL (.mp3, .wav, .ogg)…"
              className={inputClass}
            />
            <StepMediaUpload
              accept="audio/*"
              buttonLabel="…or upload an audio file"
              onUploaded={(url, storagePath) =>
                update({ audioUrl: url, audioStoragePath: storagePath })
              }
            />
          </div>
        )}

        {/* Video: upload or YouTube/external URL */}
        {step.interactionType === 'video' && (
          <div>
            <label className={labelClass}>Video</label>
            <input
              type="url"
              value={step.videoUrl ?? ''}
              onChange={(e) =>
                update({
                  videoUrl: e.target.value,
                  videoStoragePath: undefined,
                })
              }
              placeholder="Paste a YouTube or direct video URL…"
              className={inputClass}
            />
            <StepMediaUpload
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              buttonLabel="…or upload an MP4/WebM file"
              onUploaded={(url, storagePath) =>
                update({ videoUrl: url, videoStoragePath: storagePath })
              }
            />
          </div>
        )}

        {/* Pan-zoom scale */}
        {(step.interactionType === 'pan-zoom' ||
          step.interactionType === 'pan-zoom-spotlight') && (
          <div>
            <label className={labelClass}>
              Zoom Level: {step.panZoomScale ?? 2.5}×
            </label>
            <input
              type="range"
              min={1.5}
              max={6}
              step={0.5}
              value={step.panZoomScale ?? 2.5}
              onChange={(e) =>
                update({ panZoomScale: parseFloat(e.target.value) })
              }
              className="w-full accent-brand-blue-primary"
            />
          </div>
        )}

        {/* Spotlight radius */}
        {(step.interactionType === 'spotlight' ||
          step.interactionType === 'pan-zoom-spotlight') && (
          <div>
            <label className={labelClass}>
              Spotlight Radius: {step.spotlightRadius ?? 25}%
            </label>
            <input
              type="range"
              min={5}
              max={50}
              step={1}
              value={step.spotlightRadius ?? 25}
              onChange={(e) =>
                update({ spotlightRadius: parseInt(e.target.value) })
              }
              className="w-full accent-brand-blue-primary"
            />
          </div>
        )}

        {(step.interactionType === 'pan-zoom' ||
          step.interactionType === 'spotlight' ||
          step.interactionType === 'pan-zoom-spotlight') && (
          <>
            <div>
              <label className={labelClass}>Overlay Style</label>
              <select
                value={step.showOverlay ?? 'none'}
                onChange={(e) =>
                  update({
                    showOverlay: e.target
                      .value as GuidedLearningStep['showOverlay'],
                  })
                }
                className={selectClass}
              >
                <option value="none">None</option>
                <option value="popover">Popover</option>
                <option value="tooltip">Tooltip</option>
                <option value="banner">Banner</option>
              </select>
            </div>

            {(step.showOverlay ?? 'none') !== 'none' && (
              <div>
                <label className={labelClass}>Text Content</label>
                <textarea
                  value={step.text ?? ''}
                  onChange={(e) => update({ text: e.target.value })}
                  rows={4}
                  placeholder="Enter overlay text…"
                  className={`${inputClass} resize-none`}
                />
              </div>
            )}

            {step.showOverlay === 'tooltip' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Tooltip Position</label>
                  <select
                    value={step.tooltipPosition ?? 'auto'}
                    onChange={(e) =>
                      update({
                        tooltipPosition: e.target
                          .value as GuidedLearningStep['tooltipPosition'],
                      })
                    }
                    className={selectClass}
                  >
                    {TOOLTIP_POSITIONS.map((position) => (
                      <option key={position} value={position}>
                        {position[0].toUpperCase() + position.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    Tooltip Offset ({step.tooltipOffset ?? 12}px)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={48}
                    step={2}
                    value={step.tooltipOffset ?? 12}
                    onChange={(e) =>
                      update({
                        tooltipOffset: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full accent-brand-blue-primary"
                  />
                </div>
              </div>
            )}

            {step.showOverlay === 'banner' && (
              <div>
                <label className={labelClass}>Banner Tone</label>
                <select
                  value={step.bannerTone ?? 'blue'}
                  onChange={(e) =>
                    update({
                      bannerTone: e.target
                        .value as GuidedLearningStep['bannerTone'],
                    })
                  }
                  className={selectClass}
                >
                  {BANNER_TONES.map((tone) => (
                    <option key={tone} value={tone}>
                      {tone[0].toUpperCase() + tone.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {/* Question */}
        {step.interactionType === 'question' && (
          <QuestionEditor step={step} onChange={onChange} />
        )}

        {/* Auto-advance duration (for guided mode) */}
        <div>
          <label className={labelClass}>
            Auto-advance after (seconds, 0 = manual)
          </label>
          <input
            type="number"
            min={0}
            max={120}
            value={step.autoAdvanceDuration ?? 0}
            onChange={(e) =>
              update({ autoAdvanceDuration: parseInt(e.target.value) || 0 })
            }
            className={`${inputClass} w-24`}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Inline file-upload row for a step's audio/video media. Uploads to the
 * user's media path in Firebase Storage (Drive image links can't stream
 * AV files) and hands back the download URL + storage path.
 */
const StepMediaUpload: React.FC<{
  accept: string;
  buttonLabel: string;
  onUploaded: (url: string, storagePath: string) => void;
}> = ({ accept, buttonLabel, onUploaded }) => {
  const { user } = useAuth();
  const { uploadGuidedLearningVideo } = useStorage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    if (!user) return;
    setError('');
    setProgress(0);
    try {
      const { url, storagePath } = await uploadGuidedLearningVideo(
        user.uid,
        file,
        file.name.replace(/[^\w.-]+/g, '_'),
        setProgress
      );
      onUploaded(url, storagePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="mt-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={progress !== null}
        className="flex items-center gap-1.5 text-xs font-bold text-brand-blue-primary hover:text-brand-blue-dark disabled:opacity-60 transition-colors"
      >
        {progress !== null ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Uploading… {progress}%
          </>
        ) : (
          <>
            <Upload className="w-3.5 h-3.5" />
            {buttonLabel}
          </>
        )}
      </button>
      {error && (
        <p className="text-red-600 text-xs font-medium mt-1">{error}</p>
      )}
    </div>
  );
};

interface QuestionEditorProps {
  step: GuidedLearningStep;
  onChange: (updated: GuidedLearningStep) => void;
}

const QuestionEditor: React.FC<QuestionEditorProps> = ({ step, onChange }) => {
  const q = step.question ?? {
    type: 'multiple-choice' as GuidedLearningQuestionType,
    text: '',
    choices: ['', '', '', ''],
    correctAnswer: '',
  };

  const updateQ = (patch: Partial<typeof q>) => {
    onChange({ ...step, question: { ...q, ...patch } });
  };

  return (
    <div className="space-y-3 border border-slate-200 bg-slate-50 rounded-lg p-3">
      <div>
        <label className={labelClass}>Question Type</label>
        <select
          value={q.type}
          onChange={(e) =>
            updateQ({ type: e.target.value as GuidedLearningQuestionType })
          }
          className={selectClass}
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Question Text</label>
        <textarea
          value={q.text}
          onChange={(e) => updateQ({ text: e.target.value })}
          rows={2}
          placeholder="Enter your question…"
          className={`${inputClass} resize-none`}
        />
      </div>

      {q.type === 'multiple-choice' && (
        <MCEditor q={q} updateQ={updateQ} stepId={step.id} />
      )}
      {q.type === 'matching' && <MatchingEditor q={q} updateQ={updateQ} />}
      {q.type === 'sorting' && <SortingEditor q={q} updateQ={updateQ} />}
    </div>
  );
};

const MCEditor: React.FC<{
  q: NonNullable<GuidedLearningStep['question']>;
  updateQ: (p: Partial<NonNullable<GuidedLearningStep['question']>>) => void;
  stepId: string;
}> = ({ q, updateQ, stepId }) => {
  const choices = q.choices ?? ['', '', '', ''];

  const setChoice = (idx: number, val: string) => {
    const updated = [...choices];
    updated[idx] = val;
    updateQ({ choices: updated });
  };

  const addChoice = () => updateQ({ choices: [...choices, ''] });
  const removeChoice = (idx: number) => {
    const updated = choices.filter((_, i) => i !== idx);
    updateQ({ choices: updated });
  };

  return (
    <div className="space-y-2">
      <label className={labelClass}>Answer Choices (mark correct)</label>
      {choices.map((choice, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="radio"
            name={`correct-${stepId}`}
            checked={q.correctAnswer === choice && choice !== ''}
            onChange={() => updateQ({ correctAnswer: choice })}
            className="accent-emerald-600 flex-shrink-0 w-4 h-4"
            aria-label={`Mark choice ${idx + 1} as correct`}
          />
          <input
            type="text"
            value={choice}
            onChange={(e) => {
              const newVal = e.target.value;
              const wasCorrect = q.correctAnswer === choice;
              setChoice(idx, newVal);
              if (wasCorrect)
                updateQ({
                  correctAnswer: newVal,
                  choices: choices.map((c, i) => (i === idx ? newVal : c)),
                });
            }}
            placeholder={`Choice ${idx + 1}`}
            className="flex-1 bg-white border border-slate-300 rounded text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 px-2 py-1.5 text-sm"
          />
          {choices.length > 2 && (
            <button
              onClick={() => removeChoice(idx)}
              className="text-red-500 hover:text-red-700 transition-colors"
              aria-label="Remove choice"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {choices.length < 6 && (
        <button
          onClick={addChoice}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors font-bold text-xs"
        >
          <Plus className="w-3 h-3" />
          Add choice
        </button>
      )}
      {!q.correctAnswer && (
        <p className="text-amber-600 font-bold text-xs">
          Select the correct answer using the radio button.
        </p>
      )}
    </div>
  );
};

const MatchingEditor: React.FC<{
  q: NonNullable<GuidedLearningStep['question']>;
  updateQ: (p: Partial<NonNullable<GuidedLearningStep['question']>>) => void;
}> = ({ q, updateQ }) => {
  const pairs = q.matchingPairs ?? [{ left: '', right: '' }];

  const setPair = (idx: number, side: 'left' | 'right', val: string) => {
    const updated = pairs.map((p, i) =>
      i === idx ? { ...p, [side]: val } : p
    );
    updateQ({ matchingPairs: updated });
  };

  return (
    <div className="space-y-2">
      <label className={labelClass}>Matching Pairs</label>
      {pairs.map((pair, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={pair.left}
            onChange={(e) => setPair(idx, 'left', e.target.value)}
            placeholder="Term"
            className="flex-1 bg-white border border-slate-300 rounded text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 px-2 py-1.5 text-sm"
          />
          <span className="text-slate-400 font-bold">→</span>
          <input
            type="text"
            value={pair.right}
            onChange={(e) => setPair(idx, 'right', e.target.value)}
            placeholder="Definition"
            className="flex-1 bg-white border border-slate-300 rounded text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 px-2 py-1.5 text-sm"
          />
          {pairs.length > 2 && (
            <button
              onClick={() =>
                updateQ({ matchingPairs: pairs.filter((_, i) => i !== idx) })
              }
              className="text-red-500 hover:text-red-700 transition-colors"
              aria-label="Remove pair"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {pairs.length < 8 && (
        <button
          onClick={() =>
            updateQ({ matchingPairs: [...pairs, { left: '', right: '' }] })
          }
          className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors font-bold text-xs"
        >
          <Plus className="w-3 h-3" />
          Add pair
        </button>
      )}
    </div>
  );
};

const SortingEditor: React.FC<{
  q: NonNullable<GuidedLearningStep['question']>;
  updateQ: (p: Partial<NonNullable<GuidedLearningStep['question']>>) => void;
}> = ({ q, updateQ }) => {
  const items = q.sortingItems ?? [''];

  return (
    <div className="space-y-2">
      <label className={labelClass}>Items in correct order</label>
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-slate-400 font-mono font-bold text-center w-5 text-xs">
            {idx + 1}.
          </span>
          <input
            type="text"
            value={item}
            onChange={(e) => {
              const updated = [...items];
              updated[idx] = e.target.value;
              updateQ({ sortingItems: updated });
            }}
            placeholder={`Item ${idx + 1}`}
            className="flex-1 bg-white border border-slate-300 rounded text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 px-2 py-1.5 text-sm"
          />
          {items.length > 2 && (
            <button
              onClick={() =>
                updateQ({ sortingItems: items.filter((_, i) => i !== idx) })
              }
              className="text-red-500 hover:text-red-700 transition-colors"
              aria-label="Remove item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {items.length < 10 && (
        <button
          onClick={() => updateQ({ sortingItems: [...items, ''] })}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors font-bold text-xs"
        >
          <Plus className="w-3 h-3" />
          Add item
        </button>
      )}
    </div>
  );
};
