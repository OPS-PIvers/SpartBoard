import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  GuidedLearningStep,
  GuidedLearningInteractionType,
  GuidedLearningQuestionType,
} from '@/types';

interface Props {
  step: GuidedLearningStep;
  imageCount: number;
  onChange: (updated: GuidedLearningStep) => void;
  onDelete: () => void;
  isExpanded: boolean;
  onToggle: () => void;
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

export const GuidedLearningStepEditor: React.FC<Props> = ({
  step,
  imageCount,
  onChange,
  onDelete,
  isExpanded,
  onToggle,
}) => {
  const update = (patch: Partial<GuidedLearningStep>) =>
    onChange({ ...step, ...patch });

  const interactionLabel =
    INTERACTION_TYPES.find((t) => t.value === step.interactionType)?.label ??
    step.interactionType;

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center bg-white/5"
        style={{
          gap: 'min(8px, 2cqmin)',
          padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
        }}
      >
        <button
          onClick={onToggle}
          className="flex-1 text-left text-white font-bold truncate hover:text-indigo-300 transition-colors"
          style={{ fontSize: 'min(13px, 3.5cqmin)' }}
        >
          {step.label ?? interactionLabel}{' '}
          <span
            className="text-slate-500 font-normal"
            style={{ fontSize: 'clamp(11px, 3cqmin, 16px)' }}
          >
            ({step.xPct.toFixed(0)}%, {step.yPct.toFixed(0)}%)
          </span>
        </button>
        <span
          className="text-slate-500 bg-slate-700 rounded font-black uppercase tracking-tighter"
          style={{
            fontSize: 'clamp(9px, 2.2cqmin, 12px)',
            padding: 'min(2px, 0.5cqmin) min(6px, 1.5cqmin)',
          }}
        >
          {interactionLabel}
        </span>
        <button
          onClick={onDelete}
          className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
          aria-label="Delete step"
        >
          <Trash2
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
        </button>
      </div>

      {/* Expanded editor */}
      {isExpanded && (
        <div
          className="space-y-3 bg-slate-900/50"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          {/* Label */}
          <div>
            <label
              className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
              style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
            >
              Label (optional)
            </label>
            <input
              type="text"
              value={step.label ?? ''}
              onChange={(e) => update({ label: e.target.value })}
              placeholder="Step title or caption"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              style={{
                padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                fontSize: 'clamp(12px, 3.2cqmin, 16px)',
              }}
            />
          </div>

          {/* Interaction type */}
          <div>
            <label
              className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
              style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
            >
              Interaction Type
            </label>
            <select
              value={step.interactionType}
              onChange={(e) =>
                update({
                  interactionType: e.target
                    .value as GuidedLearningInteractionType,
                })
              }
              className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 appearance-none"
              style={{
                padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                fontSize: 'clamp(12px, 3.2cqmin, 16px)',
              }}
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
              <label
                className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
              >
                Image
              </label>
              <select
                value={step.imageIndex}
                onChange={(e) =>
                  update({ imageIndex: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 appearance-none"
                style={{
                  padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                  fontSize: 'clamp(12px, 3.2cqmin, 16px)',
                }}
              >
                {Array.from({ length: imageCount }, (_, i) => (
                  <option key={i} value={i}>
                    Image {i + 1}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label
            className="flex items-center text-white"
            style={{ gap: 'min(8px, 2cqmin)', fontSize: 'min(12px, 3cqmin)' }}
          >
            <input
              type="checkbox"
              checked={Boolean(step.hideStepNumber)}
              onChange={(e) => update({ hideStepNumber: e.target.checked })}
              className="accent-indigo-500"
            />
            Hide hotspot pin
          </label>

          {/* Text content */}
          {(step.interactionType === 'text-popover' ||
            step.interactionType === 'tooltip') && (
            <div>
              <label
                className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
              >
                Text Content
              </label>
              <textarea
                value={step.text ?? ''}
                onChange={(e) => update({ text: e.target.value })}
                rows={4}
                placeholder="Enter the text to display…"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
                style={{
                  padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                  fontSize: 'clamp(12px, 3.2cqmin, 16px)',
                }}
              />
            </div>
          )}

          {step.interactionType === 'tooltip' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                  style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
                >
                  Tooltip Position
                </label>
                <select
                  value={step.tooltipPosition ?? 'auto'}
                  onChange={(e) =>
                    update({
                      tooltipPosition: e.target
                        .value as GuidedLearningStep['tooltipPosition'],
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 appearance-none"
                  style={{
                    padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                    fontSize: 'clamp(12px, 3.2cqmin, 16px)',
                  }}
                >
                  {TOOLTIP_POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {position[0].toUpperCase() + position.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                  style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
                >
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
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Audio URL */}
          {step.interactionType === 'audio' && (
            <div>
              <label
                className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
              >
                Audio URL
              </label>
              <input
                type="url"
                value={step.audioUrl ?? ''}
                onChange={(e) => update({ audioUrl: e.target.value })}
                placeholder="Firebase Storage or external audio URL"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                style={{
                  padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                  fontSize: 'clamp(12px, 3.2cqmin, 16px)',
                }}
              />
              <p
                className="text-slate-500 font-medium"
                style={{
                  fontSize: 'clamp(10px, 2.5cqmin, 14px)',
                  marginTop: 'min(4px, 1cqmin)',
                }}
              >
                Paste a direct URL to an audio file (.mp3, .wav, .ogg)
              </p>
            </div>
          )}

          {/* Video URL */}
          {step.interactionType === 'video' && (
            <div>
              <label
                className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
              >
                Video URL
              </label>
              <input
                type="url"
                value={step.videoUrl ?? ''}
                onChange={(e) => update({ videoUrl: e.target.value })}
                placeholder="YouTube URL or direct video URL"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                style={{
                  padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                  fontSize: 'clamp(12px, 3.2cqmin, 16px)',
                }}
              />
            </div>
          )}

          {/* Pan-zoom scale */}
          {(step.interactionType === 'pan-zoom' ||
            step.interactionType === 'pan-zoom-spotlight') && (
            <div>
              <label
                className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
              >
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
                className="w-full accent-indigo-500"
              />
            </div>
          )}

          {/* Spotlight radius */}
          {(step.interactionType === 'spotlight' ||
            step.interactionType === 'pan-zoom-spotlight') && (
            <div>
              <label
                className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
              >
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
                className="w-full accent-indigo-500"
              />
            </div>
          )}

          {(step.interactionType === 'pan-zoom' ||
            step.interactionType === 'spotlight' ||
            step.interactionType === 'pan-zoom-spotlight') && (
            <>
              <div>
                <label
                  className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                  style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
                >
                  Overlay Style
                </label>
                <select
                  value={step.showOverlay ?? 'none'}
                  onChange={(e) =>
                    update({
                      showOverlay: e.target
                        .value as GuidedLearningStep['showOverlay'],
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 appearance-none"
                  style={{
                    padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                    fontSize: 'clamp(12px, 3.2cqmin, 16px)',
                  }}
                >
                  <option value="none">None</option>
                  <option value="popover">Popover</option>
                  <option value="tooltip">Tooltip</option>
                  <option value="banner">Banner</option>
                </select>
              </div>

              {(step.showOverlay ?? 'none') !== 'none' && (
                <div>
                  <label
                    className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                    style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
                  >
                    Text Content
                  </label>
                  <textarea
                    value={step.text ?? ''}
                    onChange={(e) => update({ text: e.target.value })}
                    rows={4}
                    placeholder="Enter overlay text…"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
                    style={{
                      padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                      fontSize: 'clamp(12px, 3.2cqmin, 16px)',
                    }}
                  />
                </div>
              )}

              {step.showOverlay === 'tooltip' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                      style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
                    >
                      Tooltip Position
                    </label>
                    <select
                      value={step.tooltipPosition ?? 'auto'}
                      onChange={(e) =>
                        update({
                          tooltipPosition: e.target
                            .value as GuidedLearningStep['tooltipPosition'],
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 appearance-none"
                      style={{
                        padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                        fontSize: 'clamp(12px, 3.2cqmin, 16px)',
                      }}
                    >
                      {TOOLTIP_POSITIONS.map((position) => (
                        <option key={position} value={position}>
                          {position[0].toUpperCase() + position.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                      style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
                    >
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
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>
              )}

              {step.showOverlay === 'banner' && (
                <div>
                  <label
                    className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
                    style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
                  >
                    Banner Tone
                  </label>
                  <select
                    value={step.bannerTone ?? 'blue'}
                    onChange={(e) =>
                      update({
                        bannerTone: e.target
                          .value as GuidedLearningStep['bannerTone'],
                      })
                    }
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 appearance-none"
                    style={{
                      padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                      fontSize: 'clamp(12px, 3.2cqmin, 16px)',
                    }}
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
            <label
              className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
              style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
            >
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
              className="bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              style={{
                width: 'min(80px, 20cqmin)',
                padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                fontSize: 'clamp(12px, 3.2cqmin, 16px)',
              }}
            />
          </div>
        </div>
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
    <div
      className="space-y-3 border border-white/10 rounded-lg bg-slate-800/30"
      style={{ padding: 'min(12px, 3cqmin)' }}
    >
      <div>
        <label
          className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
          style={{ fontSize: 'min(9px, 2.2cqmin)' }}
        >
          Question Type
        </label>
        <select
          value={q.type}
          onChange={(e) =>
            updateQ({ type: e.target.value as GuidedLearningQuestionType })
          }
          className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 appearance-none"
          style={{
            padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
            fontSize: 'min(12px, 3cqmin)',
          }}
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          className="block text-slate-400 font-bold uppercase tracking-wider mb-1"
          style={{ fontSize: 'min(9px, 2.2cqmin)' }}
        >
          Question Text
        </label>
        <textarea
          value={q.text}
          onChange={(e) => updateQ({ text: e.target.value })}
          rows={2}
          placeholder="Enter your question…"
          className="w-full bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
          style={{
            padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
            fontSize: 'min(12px, 3cqmin)',
          }}
        />
      </div>

      {/* Multiple Choice */}
      {q.type === 'multiple-choice' && (
        <MCEditor q={q} updateQ={updateQ} stepId={step.id} />
      )}

      {/* Matching */}
      {q.type === 'matching' && <MatchingEditor q={q} updateQ={updateQ} />}

      {/* Sorting */}
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
      <label
        className="block text-slate-400 font-bold uppercase tracking-wider"
        style={{ fontSize: 'min(9px, 2.2cqmin)' }}
      >
        Answer Choices (mark correct)
      </label>
      {choices.map((choice, idx) => (
        <div
          key={idx}
          className="flex items-center"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          <input
            type="radio"
            name={`correct-${stepId}`}
            checked={q.correctAnswer === choice && choice !== ''}
            onChange={() => updateQ({ correctAnswer: choice })}
            className="accent-emerald-500 flex-shrink-0"
            style={{
              width: 'min(14px, 3.5cqmin)',
              height: 'min(14px, 3.5cqmin)',
            }}
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
            className="flex-1 bg-slate-800 border border-slate-600 rounded text-white placeholder:text-slate-500 focus:outline-none"
            style={{
              padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
              fontSize: 'min(11px, 2.8cqmin)',
            }}
          />
          {choices.length > 2 && (
            <button
              onClick={() => removeChoice(idx)}
              className="text-red-400 hover:text-red-300 transition-colors"
              aria-label="Remove choice"
            >
              <Trash2
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
            </button>
          )}
        </div>
      ))}
      {choices.length < 6 && (
        <button
          onClick={addChoice}
          className="flex items-center text-slate-400 hover:text-white transition-colors font-bold"
          style={{ gap: 'min(4px, 1cqmin)', fontSize: 'min(10px, 2.5cqmin)' }}
        >
          <Plus
            style={{ width: 'min(12px, 3cqmin)', height: 'min(12px, 3cqmin)' }}
          />
          Add choice
        </button>
      )}
      {!q.correctAnswer && (
        <p
          className="text-amber-400 font-bold"
          style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
        >
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
      <label
        className="block text-slate-400 font-bold uppercase tracking-wider"
        style={{ fontSize: 'min(9px, 2.2cqmin)' }}
      >
        Matching Pairs
      </label>
      {pairs.map((pair, idx) => (
        <div
          key={idx}
          className="flex items-center"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          <input
            type="text"
            value={pair.left}
            onChange={(e) => setPair(idx, 'left', e.target.value)}
            placeholder="Term"
            className="flex-1 bg-slate-800 border border-slate-600 rounded text-white placeholder:text-slate-500 focus:outline-none"
            style={{
              padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
              fontSize: 'min(11px, 2.8cqmin)',
            }}
          />
          <span
            className="text-slate-500 font-bold"
            style={{ fontSize: 'clamp(10px, 2.5cqmin, 14px)' }}
          >
            →
          </span>
          <input
            type="text"
            value={pair.right}
            onChange={(e) => setPair(idx, 'right', e.target.value)}
            placeholder="Definition"
            className="flex-1 bg-slate-800 border border-slate-600 rounded text-white placeholder:text-slate-500 focus:outline-none"
            style={{
              padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
              fontSize: 'min(11px, 2.8cqmin)',
            }}
          />
          {pairs.length > 2 && (
            <button
              onClick={() =>
                updateQ({ matchingPairs: pairs.filter((_, i) => i !== idx) })
              }
              className="text-red-400 hover:text-red-300 transition-colors"
              aria-label="Remove pair"
            >
              <Trash2
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
            </button>
          )}
        </div>
      ))}
      {pairs.length < 8 && (
        <button
          onClick={() =>
            updateQ({ matchingPairs: [...pairs, { left: '', right: '' }] })
          }
          className="flex items-center text-slate-400 hover:text-white transition-colors font-bold"
          style={{ gap: 'min(4px, 1cqmin)', fontSize: 'min(10px, 2.5cqmin)' }}
        >
          <Plus
            style={{ width: 'min(12px, 3cqmin)', height: 'min(12px, 3cqmin)' }}
          />
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
      <label
        className="block text-slate-400 font-bold uppercase tracking-wider"
        style={{ fontSize: 'min(9px, 2.2cqmin)' }}
      >
        Items in correct order
      </label>
      {items.map((item, idx) => (
        <div
          key={idx}
          className="flex items-center"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          <span
            className="text-slate-500 font-mono font-bold text-center"
            style={{
              width: 'min(20px, 5cqmin)',
              fontSize: 'clamp(10px, 2.5cqmin, 14px)',
            }}
          >
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
            className="flex-1 bg-slate-800 border border-slate-600 rounded text-white placeholder:text-slate-500 focus:outline-none"
            style={{
              padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
              fontSize: 'min(11px, 2.8cqmin)',
            }}
          />
          {items.length > 2 && (
            <button
              onClick={() =>
                updateQ({ sortingItems: items.filter((_, i) => i !== idx) })
              }
              className="text-red-400 hover:text-red-300 transition-colors"
              aria-label="Remove item"
            >
              <Trash2
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
            </button>
          )}
        </div>
      ))}
      {items.length < 10 && (
        <button
          onClick={() => updateQ({ sortingItems: [...items, ''] })}
          className="flex items-center text-slate-400 hover:text-white transition-colors font-bold"
          style={{ gap: 'min(4px, 1cqmin)', fontSize: 'min(10px, 2.5cqmin)' }}
        >
          <Plus
            style={{ width: 'min(12px, 3cqmin)', height: 'min(12px, 3cqmin)' }}
          />
          Add item
        </button>
      )}
    </div>
  );
};
