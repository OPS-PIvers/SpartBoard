// Question fields shared by the Quiz and Video Activity editors (docs/plans/shipped/VA_QUIZ_ALIGNMENT.md slice 1).
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ChevronDown,
  Hash,
  Layers,
  Sigma,
  Tag,
  TextCursorInput,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  MetaInlineContext,
  PromptFooterContext,
} from './questionFieldContexts';
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
import {
  PromptRichEditor,
  type PromptRichEditorHandle,
} from './PromptRichEditor';
import {
  PromptAudioHost,
  PromptAudioMicButton,
  type PromptAudioState,
} from './PromptAudioField';

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
  /** A formatted prompt box with bold, italic, underline and lists. */
  promptFormat?: boolean;
  /** Shows the record audio mic in the prompt toolbar. */
  promptAudio?: boolean;
  /** Stimuli and Modified toggles in the prompt box footer. */
  extras?: React.ReactNode;
  /** Shows the Number link; adds a random number and returns its name, or null when full. */
  onAddNumber?: () => string | null;
  /** Equation, Number, Accents and Blank as icons in the formatting toolbar, not links above it. */
  toolbarTools?: boolean;
  /** The heading over the box; null hides it. */
  label?: string | null;
  placeholder?: string;
}

/** A labeled button at the end of the prompt formatting toolbar. */
const PromptToolButton: React.FC<{
  /** Omitted for one-shot inserts, which aren't toggles. */
  on?: boolean;
  onClick: () => void;
  anchor: TourAnchorAttrs;
  title?: string;
  children: React.ReactNode;
}> = ({ on, onClick, anchor, title, children }) => (
  <button
    type="button"
    aria-pressed={on}
    // Keep the caret where the insert lands.
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    title={title}
    className={`flex items-center gap-1 rounded p-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand-blue-primary ${
      on
        ? 'bg-slate-100 text-slate-900'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
    }`}
    {...anchor}
  >
    {children}
  </button>
);

export const QuestionPromptField: React.FC<QuestionPromptFieldProps> = ({
  question: q,
  onChange,
  onBlur,
  textareaRef,
  allowBlanks = true,
  anchor = tourTypeAttr('quiz-editor.prompt', 'quiz'),
  promptAccents,
  promptMath = false,
  promptFormat = false,
  promptAudio = false,
  onAddNumber,
  extras,
  toolbarTools = false,
  label = 'Question prompt',
  placeholder = 'e.g. What is the capital of France?',
}) => {
  const canRecord = promptAudio && promptFormat;
  // Stays mounted once audio existed, so Remove never remounts the prompt box.
  const [hadAudio] = React.useState(!!q.promptAudio);
  const richRef = React.useRef<PromptRichEditorHandle>(null);
  const [stimuliSlot, setStimuliSlot] = React.useState<HTMLDivElement | null>(
    null
  );
  const [modifiedSlot, setModifiedSlot] = React.useState<HTMLDivElement | null>(
    null
  );
  const [accents, setAccents] = React.useState<AccentSetId | null>(null);
  const [equation, setEquation] = React.useState<PromptEquationDraft | null>(
    null
  );
  const setText = (text: string) =>
    onChange(allowBlanks ? fibPromptUpdate(q, text) : { text });
  const insertNumber = () => {
    const name = onAddNumber?.();
    if (!name) return;
    const token = `{${name}}`;
    if (promptFormat) {
      richRef.current?.insertText(token, true);
      return;
    }
    const el = textareaRef.current;
    const at = el?.selectionStart ?? q.text.length;
    const end = el?.selectionEnd ?? at;
    const before = q.text.slice(0, at);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    setText(`${before}${pad}${token}${q.text.slice(end)}`);
  };
  const openNewEquation = () => {
    if (promptFormat) {
      setEquation({ start: -1, end: -1, math: '', editing: false });
      return;
    }
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
    if (equation.start < 0) {
      setEquation(null);
      if (math) richRef.current?.insertText(wrapPromptMath(math), true);
      return;
    }
    const before = q.text.slice(0, equation.start);
    const after = q.text.slice(equation.end);
    const pad = math && before && !/\s$/.test(before) ? ' ' : '';
    setText(`${before}${pad}${math ? wrapPromptMath(math) : ''}${after}`);
    setEquation(null);
  };
  const insertBlank = () => {
    if (promptFormat) {
      richRef.current?.insertText('___', true);
      return;
    }
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
  };
  // Equation, Number, Accents and Blank: icon buttons in the formatted box, links over a plain one.
  const promptTools = (style: 'toolbar' | 'link'): React.ReactElement[] => {
    const Btn = style === 'toolbar' ? PromptToolButton : KeyboardLink;
    const label = (text: string) =>
      style === 'toolbar' ? <span className="sr-only">{text}</span> : text;
    const tools: React.ReactElement[] = [];
    if (promptMath)
      tools.push(
        <Btn
          key="equation"
          on={equation !== null}
          onClick={() => (equation ? setEquation(null) : openNewEquation())}
          title="Equation"
          anchor={tourTypeAttr('quiz-editor.prompt-equation', 'quiz')}
        >
          <Sigma className="w-3.5 h-3.5" aria-hidden />
          {label('Equation')}
        </Btn>
      );
    if (onAddNumber)
      tools.push(
        <Btn
          key="number"
          onClick={insertNumber}
          title="Number"
          anchor={tourTypeAttr('quiz-editor.prompt-number', 'quiz')}
        >
          <Hash className="w-3.5 h-3.5" aria-hidden />
          {label('Number')}
        </Btn>
      );
    if (promptAccents)
      tools.push(
        <Btn
          key="accents"
          on={accents !== null}
          onClick={() => setAccents(accents ? null : promptAccents)}
          title="Accents"
          anchor={tourTypeAttr('quiz-editor.prompt-accents', 'quiz')}
        >
          <span
            aria-hidden
            className="flex h-3.5 w-3.5 items-center justify-center text-sm leading-none"
          >
            á
          </span>
          {label('Accents')}
        </Btn>
      );
    if (allowBlanks && q.type === 'FIB' && !q.calc)
      tools.push(
        <Btn
          key="blank"
          onClick={insertBlank}
          title="Blank"
          anchor={tourTypeAttr('quiz-editor.prompt-blank', 'quiz')}
        >
          <TextCursorInput className="w-3.5 h-3.5" aria-hidden />
          {label('Blank')}
        </Btn>
      );
    return tools;
  };
  const render = (audioState: PromptAudioState | null) => {
    const textarea = promptFormat ? (
      <PromptRichEditor
        ref={richRef}
        value={q.text}
        onChange={setText}
        onBlur={onBlur}
        readOnly={equation !== null && equation.start >= 0}
        placeholder={
          q.promptAudio ? 'Optional text under the audio' : placeholder
        }
        anchor={anchor}
        toolbarEnd={[
          ...(audioState
            ? [
                <PromptAudioMicButton
                  key="mic"
                  state={audioState}
                  canRecord={canRecord}
                />,
              ]
            : []),
          ...(toolbarTools ? promptTools('toolbar') : []),
        ]}
        footer={extras}
      />
    ) : (
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
        readOnly={equation !== null}
        rows={3}
        placeholder={placeholder}
        className={`${inputClass} resize-y min-h-[4.75rem] max-h-[60vh]`}
        {...anchor}
      />
    );
    return (
      <div>
        <div className="flex items-center justify-between">
          {label !== null && <label className={labelClass}>{label}</label>}
          {!(promptFormat && toolbarTools) && (
            <span className="flex items-center gap-3">
              {promptTools('link')}
            </span>
          )}
        </div>
        {/* Always wrapped, so toggling Accents never remounts the prompt box. */}
        <AccentKeysArea
          accents={accents ?? promptAccents}
          disabled={!accents}
          beforeKeys={
            accents && (
              <AccentLanguageRow
                value={accents}
                onChange={setAccents}
                anchor={tourTypeAttr(
                  'quiz-editor.prompt-accent-language',
                  'quiz'
                )}
              />
            )
          }
        >
          {textarea}
        </AccentKeysArea>
        {extras && (
          <>
            <div ref={setStimuliSlot} />
            <div ref={setModifiedSlot} />
          </>
        )}
        {equation && (
          <PromptEquationPanel
            key={`${equation.start}:${equation.editing}`}
            draft={equation}
            onDraftChange={(math) =>
              setEquation((d) => (d ? { ...d, math } : d))
            }
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
  const hasExtras = !!extras;
  const inlineValue = React.useMemo(
    () => (hasExtras ? { stimuliSlot, modifiedSlot } : null),
    [hasExtras, stimuliSlot, modifiedSlot]
  );
  return (
    <PromptFooterContext.Provider value={inlineValue}>
      {canRecord || hadAudio || q.promptAudio ? (
        <PromptAudioHost
          audio={q.promptAudio}
          onChange={(next) => onChange({ promptAudio: next })}
        >
          {render}
        </PromptAudioHost>
      ) : (
        render(null)
      )}
    </PromptFooterContext.Provider>
  );
};

export const metaLabelClass =
  'shrink-0 text-xs font-bold uppercase tracking-wider text-slate-500';

export const metaValueClass =
  'flex min-w-0 items-center gap-1 rounded-sm text-left text-sm text-slate-800 hover:text-brand-blue-primary focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40';

/** One row of the light question metadata list: label column, plain value. */
export const MetaItem: React.FC<{
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, children }) => {
  if (React.useContext(MetaInlineContext)) {
    return (
      <div className="flex min-h-8 min-w-0 items-center gap-2 [&_.truncate]:overflow-visible [&_.truncate]:whitespace-normal [&_.truncate]:wrap-break-word">
        <label htmlFor={htmlFor} className={metaLabelClass}>
          {label}
        </label>
        <div className="flex min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex min-h-8 items-center gap-3">
      <label htmlFor={htmlFor} className={`${metaLabelClass} w-36 max-w-[50%]`}>
        {label}
      </label>
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  );
};

export const MetaChevron: React.FC<{ open?: boolean }> = ({ open }) => (
  <ChevronDown
    className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
    aria-hidden
  />
);

const DokSelect: React.FC<{
  value: QuizQuestion['dok'];
  onChange: (dok: QuizQuestion['dok']) => void;
  /** Light metadata style: plain value under its own DOK label. */
  field?: { id: string };
}> = ({ value, onChange, field }) => {
  const { t } = useTranslation();
  if (field) {
    return (
      <span className="relative inline-flex min-w-0 items-center">
        <select
          id={field.id}
          value={value ?? ''}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(n >= 1 && n <= 4 ? (n as 1 | 2 | 3 | 4) : undefined);
          }}
          className={`${metaValueClass} cursor-pointer appearance-none bg-transparent pr-5 field-sizing-content ${value ? '' : 'text-slate-400!'}`}
          {...tourTypeAttr('quiz-editor.dok', 'quiz')}
        >
          <option value="">{t('quizDok.fieldNone', 'None')}</option>
          {[1, 2, 3, 4].map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-0">
          <MetaChevron />
        </span>
      </span>
    );
  }
  return (
    <select
      value={value ?? ''}
      aria-label={t('quizDok.level', 'DOK level')}
      onChange={(e) => {
        const n = Number(e.target.value);
        onChange(n >= 1 && n <= 4 ? (n as 1 | 2 | 3 | 4) : undefined);
      }}
      className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40"
      {...tourTypeAttr('quiz-editor.dok', 'quiz')}
    >
      <option value="">{t('quizDok.none', 'No DOK')}</option>
      {[1, 2, 3, 4].map((level) => (
        <option key={level} value={level}>
          {t('quizDok.levelOption', { level, defaultValue: 'DOK {{level}}' })}
        </option>
      ))}
    </select>
  );
};

const LegacyTargetsRows: React.FC<{
  question: Pick<QuizQuestion, 'targets' | 'dok'>;
  onChange: (targets: QuestionTargetTag[] | undefined) => void;
  onDokChange?: (dok: QuizQuestion['dok']) => void;
  onOpen: () => void;
  editAnchor: TourAnchorAttrs;
}> = ({ question: q, onChange, onDokChange, onOpen, editAnchor }) => (
  <>
    <div className="flex items-center justify-between mb-1">
      <label className={labelClass}>Learning targets</label>
      <div className="flex items-center gap-3">
        {onDokChange && <DokSelect value={q.dok} onChange={onDokChange} />}
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1 text-xs font-semibold text-brand-blue-primary hover:underline"
          {...editAnchor}
        >
          <Tag className="w-3.5 h-3.5" />
          {q.targets?.length ? 'Edit' : 'Add'}
        </button>
      </div>
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
  </>
);

const TargetsMetaItems: React.FC<{
  question: Pick<QuizQuestion, 'id' | 'targets' | 'dok'>;
  onDokChange?: (dok: QuizQuestion['dok']) => void;
  onOpen: () => void;
  editAnchor: TourAnchorAttrs;
}> = ({ question: q, onDokChange, onOpen, editAnchor }) => {
  const tags = q.targets ?? [];
  const baseId = React.useId();
  const targetsId = `${baseId}-targets`;
  const dokId = `${baseId}-dok`;
  return (
    <>
      <MetaItem label="Learning targets" htmlFor={targetsId}>
        <button
          id={targetsId}
          type="button"
          aria-haspopup="dialog"
          onClick={onOpen}
          title={tags.map((t) => t.label).join('\n') || undefined}
          aria-describedby={`${targetsId}-value`}
          className={`${metaValueClass} max-w-full`}
          {...editAnchor}
        >
          <span
            id={`${targetsId}-value`}
            className={`min-w-0 truncate ${tags.length ? '' : 'text-slate-400'}`}
          >
            {tags.length
              ? tags.map((t) => t.code ?? t.label).join(', ')
              : 'None'}
          </span>
          <MetaChevron />
        </button>
      </MetaItem>
      {onDokChange && (
        <MetaItem label="DOK" htmlFor={dokId}>
          <DokSelect
            value={q.dok}
            onChange={onDokChange}
            field={{ id: dokId }}
          />
        </MetaItem>
      )}
    </>
  );
};

interface QuestionTargetsFieldProps {
  question: Pick<QuizQuestion, 'id' | 'text' | 'targets' | 'dok'>;
  onChange: (targets: QuestionTargetTag[] | undefined) => void;
  /** Offers the DOK level beside the targets; absent where DOK is off or unsupported. */
  onDokChange?: (dok: QuizQuestion['dok']) => void;
  promptStandards: ReturnType<typeof useStandardsFromPrompt>;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  editAnchor?: TourAnchorAttrs;
  /** `question-editor-fields`: rows of the light metadata list. */
  metaList?: boolean;
}

export const QuestionTargetsField: React.FC<QuestionTargetsFieldProps> = ({
  question: q,
  onChange,
  onDokChange,
  promptStandards,
  pickerOpen,
  onPickerOpenChange,
  editAnchor = tourTypeAttr('quiz-editor.targets-edit', 'quiz'),
  metaList = false,
}) => (
  <div className={React.useContext(MetaInlineContext) ? 'contents' : undefined}>
    {metaList ? (
      <TargetsMetaItems
        question={q}
        onDokChange={onDokChange}
        onOpen={() => onPickerOpenChange(true)}
        editAnchor={editAnchor}
      />
    ) : (
      <LegacyTargetsRows
        question={q}
        onChange={onChange}
        onDokChange={onDokChange}
        onOpen={() => onPickerOpenChange(true)}
        editAnchor={editAnchor}
      />
    )}
    {promptStandards.isCurrent(q.id, q.text, q.targets) && (
      <p
        className={`basis-full text-xs text-slate-500 ${metaList ? 'py-1' : 'mt-1'}`}
        role="status"
      >
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

/** Stimuli or Modified in the prompt box footer: icon, label and current value. */
export const PromptFooterToggle: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  filled: boolean;
  open: boolean;
  controls?: string;
  hasPopup?: boolean;
  onClick: () => void;
  anchor: TourAnchorAttrs;
}> = ({
  icon: Icon,
  label,
  value,
  filled,
  open,
  controls,
  hasPopup,
  onClick,
  anchor,
}) => (
  <button
    type="button"
    aria-expanded={hasPopup ? undefined : open}
    aria-haspopup={hasPopup ? 'dialog' : undefined}
    aria-controls={controls}
    onClick={onClick}
    className="flex min-w-0 items-center gap-1.5 rounded-sm py-0.5 text-left text-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
    {...anchor}
  >
    <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
    <span className="shrink-0 font-semibold text-slate-500">{label}</span>
    <span
      className={`min-w-0 wrap-break-word ${filled ? 'text-slate-800' : 'text-slate-400'}`}
    >
      {value}
    </span>
    <MetaChevron open={open} />
  </button>
);

/** `quiz-modified-stimuli`: the modified version's own prompt box and stimuli, each switched on separately. */
export interface ModifiedVersionParts {
  prompt: React.ReactNode;
  stimuli: React.ReactNode;
  hasPrompt: boolean;
  hasStimuli: boolean;
  onClearPrompt: () => void;
  onClearStimuli: () => void;
}

const ModifiedPartRow: React.FC<{
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  anchor: TourAnchorAttrs;
  children: React.ReactNode;
}> = ({ label, on, onChange, anchor, children }) => {
  const id = React.useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="flex w-fit cursor-pointer select-none items-center gap-2 py-1 text-xs font-semibold text-slate-600"
      >
        <input
          id={id}
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked)}
          className="h-3.5 w-3.5 accent-brand-blue-primary"
          {...anchor}
        />
        {label}
      </label>
      {on && <div className="pb-1 pt-1">{children}</div>}
    </div>
  );
};

const ModifiedPartsBody: React.FC<{ parts: ModifiedVersionParts }> = ({
  parts,
}) => {
  const [promptOn, setPromptOn] = React.useState(parts.hasPrompt);
  const [stimuliOn, setStimuliOn] = React.useState(parts.hasStimuli);
  return (
    <div className="space-y-1">
      <ModifiedPartRow
        label="Modified question"
        on={promptOn || parts.hasPrompt}
        onChange={(on) => {
          setPromptOn(on);
          if (!on) parts.onClearPrompt();
        }}
        anchor={tourTypeAttr('quiz-editor.modified-question-toggle', 'quiz')}
      >
        {parts.prompt}
      </ModifiedPartRow>
      <ModifiedPartRow
        label="Modified stimuli"
        on={stimuliOn || parts.hasStimuli}
        onChange={(on) => {
          setStimuliOn(on);
          if (!on) parts.onClearStimuli();
        }}
        anchor={tourTypeAttr('quiz-editor.modified-stimuli-toggle', 'quiz')}
      >
        {parts.stimuli}
      </ModifiedPartRow>
    </div>
  );
};

/** The question's modified version, served to students in a modification group. */
export const QuestionModifiedField: React.FC<{
  question: Pick<QuizQuestion, 'id' | 'modifiedText'>;
  onChange: (modifiedText: string | undefined) => void;
  metaList?: boolean;
  parts?: ModifiedVersionParts;
}> = ({ question: q, onChange, metaList = false, parts }) => {
  const value = q.modifiedText ?? '';
  const added = parts ? parts.hasPrompt || parts.hasStimuli : value.length > 0;
  const footer = React.useContext(PromptFooterContext);
  const [open, setOpen] = React.useState(() => !metaList && added);
  const baseId = React.useId();
  const toggleId = `${baseId}-modified`;
  const textId = `${baseId}-modified-text`;
  const expanded = open;
  const textarea = (
    <textarea
      id={textId}
      value={value}
      onChange={(e) => onChange(e.target.value || undefined)}
      rows={2}
      aria-label="Modified version"
      placeholder="The question in simpler words"
      className={`${inputClass} resize-y`}
      {...tourTypeAttr('quiz-editor.modified-text', 'quiz')}
    />
  );
  const body = parts ? <ModifiedPartsBody parts={parts} /> : textarea;
  if (footer) {
    return (
      <>
        <PromptFooterToggle
          icon={Layers}
          label="Modified version"
          value={added ? 'Added' : 'None'}
          filled={added}
          open={open}
          controls={textId}
          onClick={() => setOpen((o) => !o)}
          anchor={tourTypeAttr('quiz-editor.modified', 'quiz')}
        />
        {open &&
          footer.modifiedSlot &&
          createPortal(
            <div className="pt-2" id={parts ? textId : undefined}>
              {body}
            </div>,
            footer.modifiedSlot
          )}
      </>
    );
  }
  if (!metaList) {
    return (
      <div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setOpen((o) => !o)}
          className={`${labelClass} flex items-center gap-1`}
          {...tourTypeAttr('quiz-editor.modified', 'quiz')}
        >
          Modified version
          <MetaChevron open={expanded} />
        </button>
        {expanded && body}
      </div>
    );
  }
  return (
    <div>
      <MetaItem label="Modified version" htmlFor={toggleId}>
        <button
          id={toggleId}
          type="button"
          aria-expanded={open}
          aria-controls={textId}
          onClick={() => setOpen((o) => !o)}
          className={`${metaValueClass} max-w-full`}
          {...tourTypeAttr('quiz-editor.modified', 'quiz')}
        >
          <span className={`min-w-0 truncate ${added ? '' : 'text-slate-400'}`}>
            {parts ? (added ? 'Added' : 'None') : value || 'None'}
          </span>
          <MetaChevron open={open} />
        </button>
      </MetaItem>
      {open && <div className="pb-2">{body}</div>}
    </div>
  );
};

interface QuestionExplanationFieldProps {
  question: QuizQuestion;
  onChange: (updates: Partial<QuizQuestion>) => void;
}

/** The question's explanation; each answer option's sits on its row. */
export const QuestionExplanationField: React.FC<
  QuestionExplanationFieldProps
> = ({ question: q, onChange }) => {
  const { t } = useTranslation();
  return (
    <div>
      <label className={labelClass}>
        {t('quizExplanations.heading', 'Explanation')}
      </label>
      <textarea
        {...tourTypeAttr('quiz-editor.explanation', 'quiz')}
        value={q.explanation ?? ''}
        onChange={(e) => onChange({ explanation: e.target.value || undefined })}
        rows={2}
        aria-label={t('quizExplanations.heading', 'Explanation')}
        placeholder={t(
          'quizExplanations.placeholder',
          'Why the answer is right'
        )}
        className={`${inputClass} resize-y`}
      />
    </div>
  );
};

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
