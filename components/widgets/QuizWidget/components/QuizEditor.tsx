/**
 * QuizEditor — context + detail pane components plus the AI generator
 * overlay. Mounted inside an `EditorWorkspace` by `QuizEditorModal`.
 *
 * State is owned by `useQuizEditorState`; both panes read and write
 * through the controller object the modal hands them.
 */

import React from 'react';
import {
  AlertCircle,
  GripVertical,
  MousePointerClick,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { LibraryFolder, QuizQuestion, QuizQuestionType } from '@/types';
import { FolderSelectField } from '@/components/common/library/FolderSelectField';
import { SortableList } from '@/components/common/SortableList';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';
import { AIGeneratorOverlay } from '@/components/common/AIGeneratorOverlay';
import { useAuth } from '@/context/useAuth';
import {
  MatchingAnswerEditor,
  OrderingAnswerEditor,
} from './MatchingOrderingEditor';
import type { QuizEditorController } from './useQuizEditorState';

interface PaneProps {
  state: QuizEditorController;
  aiEnabled: boolean;
  folders?: LibraryFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
}

const QUESTION_TYPES: {
  value: QuizQuestionType;
  label: string;
  hint: string;
}[] = [
  {
    value: 'MC',
    label: 'Multiple Choice',
    hint: 'One correct answer and up to 4 incorrect options.',
  },
  {
    value: 'FIB',
    label: 'Fill in the Blank',
    hint: 'Student types the exact correct word/phrase.',
  },
  {
    value: 'Matching',
    label: 'Matching',
    hint: 'Pair terms with their matching definitions. Add extra distractors to increase difficulty.',
  },
  {
    value: 'Ordering',
    label: 'Ordering',
    hint: 'List items in the correct sequence. Drag rows or use arrows to reorder.',
  },
];

/** Stable empty array reused as the matchingDistractors fallback. */
const EMPTY_DISTRACTORS: readonly string[] = Object.freeze([]);

const TYPE_BADGE: Record<QuizQuestionType, string> = {
  MC: 'bg-blue-100 text-blue-700',
  FIB: 'bg-amber-100 text-amber-800',
  Matching: 'bg-purple-100 text-purple-700',
  Ordering: 'bg-teal-100 text-teal-700',
};

const labelClass =
  'block text-slate-600 font-bold uppercase tracking-wider mb-1 text-xs';
const inputClass =
  'w-full bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary px-3 py-2 text-sm';

// ─── Context pane ────────────────────────────────────────────────────────────

export const QuizEditorContextPane: React.FC<PaneProps> = ({
  state,
  aiEnabled,
  folders,
  folderId,
  onFolderChange,
}) => {
  const {
    title,
    setTitle,
    questions,
    selectedId,
    setSelectedId,
    addQuestion,
    deleteQuestion,
    reorderQuestions,
    error,
    setShowAiPrompt,
  } = state;

  return (
    <div className="flex flex-col h-full">
      {/* Settings strip */}
      <div className="px-5 py-4 border-b border-slate-200 space-y-3 bg-white shrink-0">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Quiz title (e.g. Science Unit 4 Review)"
          className="w-full bg-transparent border-0 text-slate-900 placeholder:text-slate-400 focus:outline-none text-lg font-bold p-0"
        />
        {folders && onFolderChange && (
          <FolderSelectField
            folders={folders}
            value={folderId ?? null}
            onChange={onFolderChange}
          />
        )}
        {error && (
          <div className="p-2.5 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-lg flex items-center gap-2 text-xs text-brand-red-dark font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Question list */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-50 px-5 pb-5 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Questions ({questions.length})
          </h4>
          <div className="flex items-center gap-2">
            {aiEnabled && (
              <button
                onClick={() => setShowAiPrompt(true)}
                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                title="Generate questions with AI"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                Draft with AI
              </button>
            )}
            <button
              onClick={addQuestion}
              className="flex items-center gap-1 px-2.5 py-1 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-lg text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8 border-2 border-dashed border-slate-300 rounded-lg bg-white">
            No questions yet. Click <strong>Add</strong> to create your first
            question, or use <strong>Draft with AI</strong>.
          </div>
        ) : (
          <SortableList
            items={questions}
            getId={(q) => q.id}
            onReorder={reorderQuestions}
            renderItem={(q, handle) => (
              <QuestionRow
                question={q}
                index={questions.findIndex((x) => x.id === q.id)}
                isSelected={q.id === selectedId}
                onSelect={() => setSelectedId(q.id)}
                onDelete={() => deleteQuestion(q.id)}
                dragHandleAttributes={handle.attributes}
                dragHandleListeners={handle.listeners}
              />
            )}
            className="space-y-1.5"
          />
        )}
      </div>
    </div>
  );
};

// ─── Question row ────────────────────────────────────────────────────────────

interface QuestionRowProps {
  question: QuizQuestion;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  dragHandleAttributes: React.HTMLAttributes<HTMLElement>;
  dragHandleListeners: Record<string, (event: Event) => void> | undefined;
}

const QuestionRow: React.FC<QuestionRowProps> = ({
  question,
  index,
  isSelected,
  onSelect,
  onDelete,
  dragHandleAttributes,
  dragHandleListeners,
}) => {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg border bg-white cursor-pointer transition-all ${
        isSelected
          ? 'border-brand-blue-primary ring-2 ring-brand-blue-primary/15'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <button
        type="button"
        {...dragHandleAttributes}
        onPointerDown={
          dragHandleListeners?.onPointerDown as
            | React.PointerEventHandler<HTMLButtonElement>
            | undefined
        }
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none p-0.5"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="text-slate-400 font-mono font-bold text-xs w-5 shrink-0 text-center">
        {index + 1}
      </span>
      <span
        className={`shrink-0 px-1.5 py-0.5 rounded text-xxs font-bold uppercase tracking-wider ${TYPE_BADGE[question.type]}`}
      >
        {question.type}
      </span>
      <span className="flex-1 text-sm text-slate-700 truncate">
        {question.text || (
          <span className="italic text-slate-400">Untitled question</span>
        )}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete question"
        className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded p-1 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

// ─── Detail pane ─────────────────────────────────────────────────────────────

export const QuizEditorDetailPane: React.FC<PaneProps> = ({ state }) => {
  const {
    selectedQuestion,
    selectedIndex,
    questions,
    updateQuestion,
    updateIncorrect,
    addIncorrect,
    removeIncorrect,
  } = state;

  if (!selectedQuestion) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center px-8 py-12 text-slate-500">
        <MousePointerClick className="w-10 h-10 mb-3 text-slate-400" />
        <h4 className="text-base font-bold text-slate-700 mb-1">
          {questions.length === 0 ? 'No questions yet' : 'Pick a question'}
        </h4>
        <p className="text-sm max-w-xs">
          {questions.length === 0
            ? 'Add a question or draft with AI to start editing.'
            : 'Click a question in the list to edit it here.'}
        </p>
      </div>
    );
  }

  const q = selectedQuestion;
  const typeMeta = QUESTION_TYPES.find((t) => t.value === q.type);

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">
          Question {selectedIndex + 1} of {questions.length}
          <span className="mx-1.5">·</span>
          {typeMeta?.label ?? q.type}
        </div>
        <h4 className="text-base font-bold text-slate-900 truncate mt-0.5">
          {q.text.trim() || `Question ${selectedIndex + 1}`}
        </h4>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">
        {/* Question prompt */}
        <div>
          <label className={labelClass}>Question prompt</label>
          <textarea
            value={q.text}
            onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
            rows={3}
            placeholder="e.g. What is the capital of France?"
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Type / time / points row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Type</label>
            <select
              value={q.type}
              onChange={(e) =>
                updateQuestion(q.id, {
                  type: e.target.value as QuizQuestionType,
                  incorrectAnswers: e.target.value === 'MC' ? ['', ''] : [],
                  correctAnswer: '',
                  matchingDistractors: undefined,
                })
              }
              className={`${inputClass} appearance-none`}
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Time Limit</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={300}
                value={q.timeLimit}
                onChange={(e) =>
                  updateQuestion(q.id, {
                    timeLimit: parseInt(e.target.value, 10) || 0,
                  })
                }
                className={`${inputClass} pr-12`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xxs uppercase tracking-wider">
                Sec
              </span>
            </div>
          </div>
          <div>
            <label className={labelClass}>Points</label>
            <input
              type="number"
              min={1}
              max={100}
              value={q.points ?? 1}
              onChange={(e) =>
                updateQuestion(q.id, {
                  points: Math.min(
                    100,
                    Math.max(1, parseInt(e.target.value, 10) || 1)
                  ),
                })
              }
              className={inputClass}
            />
          </div>
        </div>

        {(q.type === 'Matching' || q.type === 'Ordering') && (
          <div className="flex items-start gap-2">
            <div className="flex-1 flex gap-2 p-2.5 bg-brand-blue-primary text-white rounded-lg shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs">{typeMeta?.hint}</p>
            </div>
            <label
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg cursor-pointer select-none shrink-0"
              title={
                q.type === 'Matching'
                  ? 'Award partial points based on the number of correct pairs.'
                  : 'Award partial points based on the longest correctly-ordered sequence.'
              }
            >
              <input
                type="checkbox"
                checked={q.allowPartialCredit === true}
                onChange={(e) =>
                  updateQuestion(q.id, {
                    allowPartialCredit: e.target.checked,
                  })
                }
                className="w-4 h-4 accent-brand-blue-primary"
              />
              <span className="font-bold text-xs text-slate-700 whitespace-nowrap">
                Partial credit
              </span>
            </label>
          </div>
        )}

        {/* Type-specific answer editor */}
        {q.type === 'Matching' ? (
          <MatchingAnswerEditor
            correctAnswer={q.correctAnswer}
            matchingDistractors={
              q.matchingDistractors ?? (EMPTY_DISTRACTORS as string[])
            }
            onChange={({ correctAnswer, matchingDistractors }) =>
              updateQuestion(q.id, {
                correctAnswer,
                matchingDistractors,
              })
            }
          />
        ) : q.type === 'Ordering' ? (
          <OrderingAnswerEditor
            correctAnswer={q.correctAnswer}
            onChange={(correctAnswer) =>
              updateQuestion(q.id, { correctAnswer })
            }
          />
        ) : (
          <div>
            <label className="block font-bold text-emerald-700 mb-1 text-xs uppercase tracking-wider">
              Correct Answer
            </label>
            <input
              type="text"
              value={q.correctAnswer}
              onChange={(e) =>
                updateQuestion(q.id, { correctAnswer: e.target.value })
              }
              className="w-full px-3 py-2 bg-white border-2 border-emerald-500/30 rounded-lg text-emerald-800 font-bold focus:outline-none focus:border-emerald-500 text-sm"
              placeholder="Enter the definitive answer"
            />
          </div>
        )}

        {q.type === 'MC' && (
          <div className="space-y-2">
            <label className="block font-bold text-slate-600 mb-1 text-xs uppercase tracking-wider">
              Distractors (Incorrect Options)
            </label>
            <div className="grid gap-2">
              {q.incorrectAnswers.map((ans, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={ans}
                    onChange={(e) => updateIncorrect(q.id, idx, e.target.value)}
                    placeholder={`Distractor ${idx + 1}`}
                    className={inputClass}
                  />
                  {q.incorrectAnswers.length > 1 && (
                    <button
                      onClick={() => removeIncorrect(q.id, idx)}
                      className="px-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      aria-label={`Remove distractor ${idx + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {q.incorrectAnswers.length < 4 && (
                <button
                  onClick={() => addIncorrect(q.id)}
                  className="flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-slate-300 hover:border-brand-blue-primary/40 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-brand-blue-primary font-bold transition-all text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Choice
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── AI overlay ──────────────────────────────────────────────────────────────

interface AiOverlayProps {
  state: QuizEditorController;
}

export const QuizAiOverlay: React.FC<AiOverlayProps> = ({ state }) => {
  const { canAccessFeature } = useAuth();
  const {
    showAiPrompt,
    setShowAiPrompt,
    aiPrompt,
    setAiPrompt,
    aiGenerating,
    aiError,
    setAiFile,
    aiFileExtracting,
    setAiFileExtracting,
    runAiGenerate,
  } = state;

  return (
    <AIGeneratorOverlay
      open={showAiPrompt}
      onClose={() => setShowAiPrompt(false)}
      title="Magic Quiz Generator"
      description="Describe the quiz you want to create. Generated questions will be appended to the current list."
      generating={aiGenerating}
      canGenerate={!!aiPrompt.trim() && !aiFileExtracting}
      onGenerate={() => void runAiGenerate()}
      error={aiError}
      generateLabel="Generate Quiz"
    >
      <textarea
        value={aiPrompt}
        onChange={(e) => setAiPrompt(e.target.value)}
        placeholder="e.g. A 5-question quiz about the solar system for 3rd graders."
        className="w-full h-32 p-4 bg-white border-2 border-indigo-100 rounded-2xl text-sm text-indigo-900 placeholder-indigo-300 focus:outline-none focus:border-indigo-500 resize-none shadow-inner"
        autoFocus
        aria-label="Describe your quiz"
      />
      {canAccessFeature('ai-file-context') && (
        <DriveFileAttachment
          onFileContent={(content, name) => setAiFile(content, name)}
          onExtractingChange={setAiFileExtracting}
          disabled={aiGenerating}
        />
      )}
    </AIGeneratorOverlay>
  );
};
