import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  GuidedLearningStep,
  GuidedLearningInteractionType,
  GuidedLearningQuestionType,
} from '@/types';

interface Props {
  step: GuidedLearningStep;
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
  { value: 'spotlight', label: 'Spotlight' },
  { value: 'question', label: 'Question' },
];

const QUESTION_TYPES: { value: GuidedLearningQuestionType; label: string }[] = [
  { value: 'multiple-choice', label: 'Multiple Choice' },
  { value: 'matching', label: 'Matching' },
  { value: 'sorting', label: 'Sorting' },
];

export const GuidedLearningStepEditor: React.FC<Props> = ({
  step,
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
      <div className="flex items-center gap-2 px-3 py-2 bg-white/5">
        <button
          onClick={onToggle}
          className="flex-1 text-left text-sm text-white font-medium truncate hover:text-indigo-300 transition-colors"
        >
          {step.label ?? interactionLabel}{' '}
          <span className="text-slate-500 font-normal text-xs">
            ({step.xPct.toFixed(0)}%, {step.yPct.toFixed(0)}%)
          </span>
        </button>
        <span className="text-xs text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">
          {interactionLabel}
        </span>
        <button
          onClick={onDelete}
          className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
          aria-label="Delete step"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded editor */}
      {isExpanded && (
        <div className="p-3 space-y-3 bg-slate-900/50">
          {/* Label */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Label (optional)
            </label>
            <input
              type="text"
              value={step.label ?? ''}
              onChange={(e) => update({ label: e.target.value })}
              placeholder="Step title or caption"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
            />
          </div>

          {/* Interaction type */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
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
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
            >
              {INTERACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Text content */}
          {(step.interactionType === 'text-popover' ||
            step.interactionType === 'tooltip') && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Text Content
              </label>
              <textarea
                value={step.text ?? ''}
                onChange={(e) => update({ text: e.target.value })}
                rows={4}
                placeholder="Enter the text to display…"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
              />
            </div>
          )}

          {/* Audio URL */}
          {step.interactionType === 'audio' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Audio URL
              </label>
              <input
                type="url"
                value={step.audioUrl ?? ''}
                onChange={(e) => update({ audioUrl: e.target.value })}
                placeholder="Firebase Storage or external audio URL"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">
                Paste a direct URL to an audio file (.mp3, .wav, .ogg)
              </p>
            </div>
          )}

          {/* Video URL */}
          {step.interactionType === 'video' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Video URL
              </label>
              <input
                type="url"
                value={step.videoUrl ?? ''}
                onChange={(e) => update({ videoUrl: e.target.value })}
                placeholder="YouTube URL or direct video URL"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
              />
            </div>
          )}

          {/* Pan-zoom scale */}
          {step.interactionType === 'pan-zoom' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">
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
          {step.interactionType === 'spotlight' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Spotlight Radius: {step.spotlightRadius ?? 25}% of container
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

          {/* Question */}
          {step.interactionType === 'question' && (
            <QuestionEditor step={step} onChange={onChange} />
          )}

          {/* Auto-advance duration (for guided mode) */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
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
              className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
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
    <div className="space-y-3 border border-white/10 rounded-lg p-3 bg-slate-800/30">
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Question Type
        </label>
        <select
          value={q.type}
          onChange={(e) =>
            updateQ({ type: e.target.value as GuidedLearningQuestionType })
          }
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm"
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Question Text
        </label>
        <textarea
          value={q.text}
          onChange={(e) => updateQ({ text: e.target.value })}
          rows={2}
          placeholder="Enter your question…"
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
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
      <label className="block text-xs text-slate-400">
        Answer Choices (mark correct answer)
      </label>
      {choices.map((choice, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="radio"
            name={`correct-${stepId}`}
            checked={q.correctAnswer === choice && choice !== ''}
            onChange={() => updateQ({ correctAnswer: choice })}
            className="accent-emerald-500 flex-shrink-0"
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
            className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-xs"
          />
          {choices.length > 2 && (
            <button
              onClick={() => removeChoice(idx)}
              className="text-red-400 hover:text-red-300"
              aria-label="Remove choice"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      {choices.length < 6 && (
        <button
          onClick={addChoice}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <Plus className="w-3 h-3" /> Add choice
        </button>
      )}
      {!q.correctAnswer && (
        <p className="text-xs text-amber-400">
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
      <label className="block text-xs text-slate-400">Matching Pairs</label>
      {pairs.map((pair, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={pair.left}
            onChange={(e) => setPair(idx, 'left', e.target.value)}
            placeholder="Term"
            className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-xs"
          />
          <span className="text-slate-500 text-xs">→</span>
          <input
            type="text"
            value={pair.right}
            onChange={(e) => setPair(idx, 'right', e.target.value)}
            placeholder="Definition"
            className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-xs"
          />
          {pairs.length > 2 && (
            <button
              onClick={() =>
                updateQ({ matchingPairs: pairs.filter((_, i) => i !== idx) })
              }
              className="text-red-400 hover:text-red-300"
              aria-label="Remove pair"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      {pairs.length < 8 && (
        <button
          onClick={() =>
            updateQ({ matchingPairs: [...pairs, { left: '', right: '' }] })
          }
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
        >
          <Plus className="w-3 h-3" /> Add pair
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
      <label className="block text-xs text-slate-400">
        Items in correct order
      </label>
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-slate-500 text-xs w-5 text-center">
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
            className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-xs"
          />
          {items.length > 2 && (
            <button
              onClick={() =>
                updateQ({ sortingItems: items.filter((_, i) => i !== idx) })
              }
              className="text-red-400 hover:text-red-300"
              aria-label="Remove item"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      {items.length < 10 && (
        <button
          onClick={() => updateQ({ sortingItems: [...items, ''] })}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
        >
          <Plus className="w-3 h-3" /> Add item
        </button>
      )}
    </div>
  );
};
