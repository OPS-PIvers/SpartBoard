// Question fields shared by the Quiz and Video Activity editors (docs/plans/shipped/VA_QUIZ_ALIGNMENT.md slice 1).
import React from 'react';
import { AlertCircle, Plus, Sigma, Tag } from 'lucide-react';
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
import { AnswerKeyKeyboard, type KeyboardSettings } from './AnswerKeyKeyboard';
import { QUESTION_TYPES, fibPromptUpdate } from './questionFieldUpdates';
import { AccentLanguageRow, KeyboardLink } from './AnswerKeyboardControls';
import { AccentKeysArea } from '@/components/student/keyboards/AccentKeys';
import type { AccentSetId } from '@/types';
import {
  hasPromptMath,
  splitPromptMath,
  wrapPromptMath,
} from '@/utils/promptMath';
import {
  PromptEquationPanel,
  PromptMathPreview,
  type PromptEquationDraft,
} from './PromptEquations';

const MathAnswerField = React.lazy(
  () => import('@/components/student/keyboards/MathAnswerField')
);

interface QuestionPromptFieldProps {
  question: QuizQuestion;
  onChange: (updates: Partial<QuizQuestion>) => void;
  onBlur?: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** FIB prompts take `___` blanks; off where only one typed answer is stored. */
  allowBlanks?: boolean;
  anchor?: TourAnchorAttrs;
  /** Accent keys teachers can open under the prompt; the default language. */
  promptAccents?: AccentSetId;
  /** Shows the Equation link that puts drawn equations in the prompt. */
  promptMath?: boolean;
}

export const QuestionPromptField: React.FC<QuestionPromptFieldProps> = ({
  question: q,
  onChange,
  onBlur,
  textareaRef,
  allowBlanks = true,
  anchor = tourTypeAttr('quiz-editor.prompt', 'quiz'),
  promptAccents,
  promptMath = false,
}) => {
  const [accents, setAccents] = React.useState<AccentSetId | null>(null);
  const [equation, setEquation] = React.useState<PromptEquationDraft | null>(
    null
  );
  const setText = (text: string) =>
    onChange(allowBlanks ? fibPromptUpdate(q, text) : { text });
  const openNewEquation = () => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? q.text.length;
    const end = el?.selectionEnd ?? start;
    setEquation({ start, end, math: '', editing: false });
  };
  const openEquation = (index: number) => {
    const part = splitPromptMath(q.text).filter((p) => p.kind === 'math')[
      index
    ];
    if (part?.kind !== 'math') return;
    setEquation({
      start: part.start,
      end: part.end,
      math: part.math,
      editing: true,
    });
  };
  const saveEquation = () => {
    if (!equation) return;
    const math = equation.math.trim();
    const before = q.text.slice(0, equation.start);
    const after = q.text.slice(equation.end);
    const pad = math && before && !/\s$/.test(before) ? ' ' : '';
    setText(`${before}${pad}${math ? wrapPromptMath(math) : ''}${after}`);
    setEquation(null);
  };
  const textarea = (
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
  );
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className={labelClass}>Question prompt</label>
        <span className="flex items-center gap-3">
          {promptMath && (
            <KeyboardLink
              on={equation !== null}
              onClick={() => (equation ? setEquation(null) : openNewEquation())}
              anchor={tourTypeAttr('quiz-editor.prompt-equation', 'quiz')}
            >
              <Sigma className="w-3.5 h-3.5" aria-hidden />
              Equation
            </KeyboardLink>
          )}
          {promptAccents && (
            <KeyboardLink
              on={accents !== null}
              onClick={() => setAccents(accents ? null : promptAccents)}
              anchor={tourTypeAttr('quiz-editor.prompt-accents', 'quiz')}
            >
              <span aria-hidden>á</span>
              Accents
            </KeyboardLink>
          )}
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
        </span>
      </div>
      {accents ? (
        <AccentKeysArea
          accents={accents}
          beforeKeys={
            <AccentLanguageRow
              value={accents}
              onChange={setAccents}
              anchor={tourTypeAttr(
                'quiz-editor.prompt-accent-language',
                'quiz'
              )}
            />
          }
        >
          {textarea}
        </AccentKeysArea>
      ) : (
        textarea
      )}
      {equation && (
        <PromptEquationPanel
          key={`${equation.start}:${equation.editing}`}
          draft={equation}
          onDraftChange={(math) => setEquation((d) => (d ? { ...d, math } : d))}
          onCancel={() => setEquation(null)}
          onSave={saveEquation}
        />
      )}
      {hasPromptMath(q.text) && (
        <PromptMathPreview text={q.text} onEdit={openEquation} />
      )}
    </div>
  );
};

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
  /** Per-type label overrides, e.g. Video Activity's "Short Answer". */
  labels?: Partial<Record<QuizQuestionType, string>>;
}

export const QuestionTypeSelect: React.FC<QuestionTypeSelectProps> = ({
  question: q,
  types,
  onSelect,
  anchor = tourTypeAttr('quiz-editor.type', 'quiz'),
  labels,
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
        {labels?.[t.value] ?? t.label}
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
  /** Math and Accents switches; absent where the student keyboard isn't offered. */
  keyboard?: KeyboardSettings;
}

/** One typed answer: Correct Answer, plus Other accepted answers for FIB. */
export const FibAnswerField: React.FC<FibAnswerFieldProps> = ({
  question: q,
  onChange,
  answerAnchor = tourTypeAttr('quiz-editor.fib-answer', 'quiz'),
  keyboard,
}) => (
  <AnswerKeyKeyboard question={q} onChange={onChange} keyboard={keyboard}>
    {({ links, renderInput }) => (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block font-bold text-emerald-700 text-xs uppercase tracking-wider">
            Correct Answer
          </label>
          {links}
        </div>
        {renderInput ? (
          <React.Suspense fallback={null}>
            <MathAnswerField
              key={q.id}
              value={q.correctAnswer}
              onChange={(plain) => onChange({ correctAnswer: plain })}
              ariaLabel="Correct answer"
              anchor={answerAnchor}
              normalize
              className="min-h-11! py-0! px-3! border-2! rounded-lg! bg-white border-emerald-500/30 text-emerald-800 focus-within:border-emerald-500"
            />
          </React.Suspense>
        ) : (
          <input
            type="text"
            value={q.correctAnswer}
            onChange={(e) => onChange({ correctAnswer: e.target.value })}
            className="w-full px-3 py-2 bg-white border-2 border-emerald-500/30 rounded-lg text-emerald-800 font-bold focus:outline-hidden focus:border-emerald-500 text-sm"
            placeholder="Enter the definitive answer"
            {...answerAnchor}
          />
        )}
        <NeedsAnswerNotice
          question={q}
          className="mt-1 flex items-center gap-1 text-xxs font-bold text-amber-700"
        />
        {q.type === 'FIB' && (
          <AlternateAnswersEditor
            key={renderInput ? 'math' : 'text'}
            alternates={q.alternateAnswers ?? []}
            renderInput={renderInput}
            onChange={(next) =>
              onChange({
                alternateAnswers: next.length > 0 ? next : undefined,
              })
            }
          />
        )}
      </div>
    )}
  </AnswerKeyKeyboard>
);
