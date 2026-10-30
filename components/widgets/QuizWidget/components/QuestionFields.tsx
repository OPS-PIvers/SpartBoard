// Question fields shared by the Quiz and Video Activity editors (docs/plans/VA_QUIZ_ALIGNMENT.md slice 1).
import React from 'react';
import { AlertCircle, Plus, Tag } from 'lucide-react';
import type {
  QuestionTargetTag,
  QuizQuestion,
  QuizQuestionType,
} from '@/types';
import {
  type TourAnchorAttrs,
  tourAttr,
  tourTypeAttr,
} from '@/config/tourAnchors';
import { TargetChips } from '@/components/quiz/targets/TargetChips';
import { TargetPicker } from '@/components/quiz/targets/TargetPicker';
import type { useStandardsFromPrompt } from '@/components/quiz/targets/useStandardsFromPrompt';
import { questionNeedsKey } from '@/utils/quizNeedsKey';
import { inputClass, labelClass } from './quizEditorFieldStyles';
import { AlternateAnswersEditor } from './AlternateAnswersEditor';
import { QUESTION_TYPES, fibPromptUpdate } from './questionFieldUpdates';

interface QuestionPromptFieldProps {
  question: QuizQuestion;
  onChange: (updates: Partial<QuizQuestion>) => void;
  onBlur?: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** FIB prompts take `___` blanks; off where only one typed answer is stored. */
  allowBlanks?: boolean;
  anchor?: TourAnchorAttrs;
}

export const QuestionPromptField: React.FC<QuestionPromptFieldProps> = ({
  question: q,
  onChange,
  onBlur,
  textareaRef,
  allowBlanks = true,
  anchor = tourTypeAttr('quiz-editor.prompt', 'quiz'),
}) => (
  <div>
    <div className="flex items-center justify-between">
      <label className={labelClass}>Question prompt</label>
      {allowBlanks && q.type === 'FIB' && (
        <button
          type="button"
          onClick={() => {
            const el = textareaRef.current;
            const at = el?.selectionStart ?? q.text.length;
            const end = el?.selectionEnd ?? at;
            const before = q.text.slice(0, at);
            const pad = before && !/\s$/.test(before) ? ' ' : '';
            const text = `${before}${pad}___${q.text.slice(end)}`;
            onChange(fibPromptUpdate(q, text));
            requestAnimationFrame(() => {
              const caret = at + pad.length + 3;
              el?.focus();
              el?.setSelectionRange(caret, caret);
            });
          }}
          className="flex items-center gap-1 text-xs font-semibold text-brand-blue-primary hover:underline"
          {...tourTypeAttr('quiz-editor.prompt-blank', 'quiz')}
        >
          <Plus className="w-3.5 h-3.5" />
          Blank
        </button>
      )}
    </div>
    <textarea
      ref={textareaRef}
      value={q.text}
      onChange={(e) =>
        onChange(
          allowBlanks
            ? fibPromptUpdate(q, e.target.value)
            : { text: e.target.value }
        )
      }
      onBlur={onBlur}
      rows={3}
      placeholder="e.g. What is the capital of France?"
      className={`${inputClass} resize-none`}
      {...anchor}
    />
  </div>
);

interface QuestionTargetsFieldProps {
  question: Pick<QuizQuestion, 'id' | 'text' | 'targets'>;
  onChange: (targets: QuestionTargetTag[] | undefined) => void;
  promptStandards: ReturnType<typeof useStandardsFromPrompt>;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  editAnchor?: TourAnchorAttrs;
}

export const QuestionTargetsField: React.FC<QuestionTargetsFieldProps> = ({
  question: q,
  onChange,
  promptStandards,
  pickerOpen,
  onPickerOpenChange,
  editAnchor = tourTypeAttr('quiz-editor.targets-edit', 'quiz'),
}) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <label className={labelClass}>Learning targets</label>
      <button
        type="button"
        onClick={() => onPickerOpenChange(true)}
        className="flex items-center gap-1 text-xs font-semibold text-brand-blue-primary hover:underline"
        {...editAnchor}
      >
        <Tag className="w-3.5 h-3.5" />
        {q.targets?.length ? 'Edit' : 'Add'}
      </button>
    </div>
    {q.targets?.length ? (
      <TargetChips
        targets={q.targets}
        onRemove={(id) => {
          const remaining = (q.targets ?? []).filter((t) => t.id !== id);
          onChange(remaining.length ? remaining : undefined);
        }}
      />
    ) : (
      <p className="text-xs text-slate-500">No targets.</p>
    )}
    {promptStandards.isCurrent(q.id, q.text, q.targets) && (
      <p className="mt-1 text-xs text-slate-500" role="status">
        {`Tagged ${promptStandards.taken?.codes.join(', ')} from the question.`}{' '}
        <button
          type="button"
          onClick={promptStandards.undo}
          className="font-semibold text-brand-blue-primary hover:underline"
          {...tourAttr('quiz-editor.prompt-standards-undo')}
        >
          Undo
        </button>
      </p>
    )}
    {pickerOpen && (
      <TargetPicker
        open
        initial={q.targets ?? []}
        onApply={(tags: QuestionTargetTag[]) => {
          onChange(tags.length ? tags : undefined);
          onPickerOpenChange(false);
        }}
        onClose={() => onPickerOpenChange(false)}
      />
    )}
  </div>
);

interface QuestionTypeSelectProps {
  question: QuizQuestion;
  /** Types offered; MA is never listed (Multiple Choice with several correct). */
  types?: readonly QuizQuestionType[];
  onSelect: (nextType: QuizQuestionType) => void;
  anchor?: TourAnchorAttrs;
}

export const QuestionTypeSelect: React.FC<QuestionTypeSelectProps> = ({
  question: q,
  types,
  onSelect,
  anchor = tourTypeAttr('quiz-editor.type', 'quiz'),
}) => (
  <select
    value={q.type === 'MA' ? 'MC' : q.type}
    aria-label="Type"
    {...anchor}
    onChange={(e) => onSelect(e.target.value as QuizQuestionType)}
    className={`${inputClass} appearance-none`}
  >
    {QUESTION_TYPES.filter(
      (t) => t.value !== 'MA' && (!types || types.includes(t.value))
    ).map((t) => (
      <option key={t.value} value={t.value}>
        {t.label}
      </option>
    ))}
  </select>
);

export const NeedsAnswerNotice: React.FC<{
  question: QuizQuestion;
  className: string;
}> = ({ question, className }) =>
  questionNeedsKey(question) ? (
    <p role="status" className={className}>
      <AlertCircle className="w-3 h-3" aria-hidden />
      No answer imported. Add one before assigning.
    </p>
  ) : null;

interface FibAnswerFieldProps {
  question: QuizQuestion;
  onChange: (updates: Partial<QuizQuestion>) => void;
  answerAnchor?: TourAnchorAttrs;
}

/** One typed answer: Correct Answer, plus Other accepted answers for FIB. */
export const FibAnswerField: React.FC<FibAnswerFieldProps> = ({
  question: q,
  onChange,
  answerAnchor = tourTypeAttr('quiz-editor.fib-answer', 'quiz'),
}) => (
  <div>
    <label className="block font-bold text-emerald-700 mb-1 text-xs uppercase tracking-wider">
      Correct Answer
    </label>
    <input
      type="text"
      value={q.correctAnswer}
      onChange={(e) => onChange({ correctAnswer: e.target.value })}
      className="w-full px-3 py-2 bg-white border-2 border-emerald-500/30 rounded-lg text-emerald-800 font-bold focus:outline-hidden focus:border-emerald-500 text-sm"
      placeholder="Enter the definitive answer"
      {...answerAnchor}
    />
    <NeedsAnswerNotice
      question={q}
      className="mt-1 flex items-center gap-1 text-xxs font-bold text-amber-700"
    />
    {q.type === 'FIB' && (
      <AlternateAnswersEditor
        alternates={q.alternateAnswers ?? []}
        onChange={(next) =>
          onChange({
            alternateAnswers: next.length > 0 ? next : undefined,
          })
        }
      />
    )}
  </div>
);
