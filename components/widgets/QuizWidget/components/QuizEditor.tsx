/**
 * QuizEditor — context + detail pane components plus the AI generator
 * overlay. Mounted inside an `EditorWorkspace` by `QuizEditorModal`.
 *
 * State is owned by `useQuizEditorState`; both panes read and write
 * through the controller object the modal hands them.
 */

import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  ChevronDown,
  Copy,
  GripVertical,
  Heading,
  KeyRound,
  Library,
  Mic,
  MousePointerClick,
  Plus,
  Shuffle,
  Wand2,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  QuestionTargetTag,
  QuizOrderEntry,
  QuizQuestion,
  QuizQuestionType,
  Rubric,
  isFreeResponseType,
} from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { BankSlotDetail, BankSlotRow } from './BankSlotRow';
import { SectionRow } from './SectionRow';
import { sectionQuestionCounts } from '@/utils/quizSections';
import { findSlotSource, slotEligibleFromSource } from './bankSlotHelpers';
import { BankPickerModal } from './BankPickerModal';
import { SaveToBankModal } from './SaveToBankModal';
import type { QuizEditorBankApi } from './QuizEditorModal';
import { SortableList } from '@/components/common/SortableList';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';
import { AIGeneratorOverlay } from '@/components/common/AIGeneratorOverlay';
import { AI_PROMPT_TEXTAREA_CLASS } from '@/components/common/aiPanelStyles';
import { useAuth } from '@/context/useAuth';
import {
  MatchingAnswerEditor,
  OrderingAnswerEditor,
} from './MatchingOrderingEditor';
import { labelClass, inputClass } from './quizEditorFieldStyles';
import { DraftNumberInput } from './DraftNumberInput';
import {
  QuestionStimulusSection,
  SlotStimulusSection,
} from './StimulusManagerPanel';
import {
  ResponseFormatControl,
  SpokenResponseSettings,
} from './ResponseFormatSection';
import { useWhiteboardImageUpload } from './useWhiteboardImageUpload';
import { canAccessQuizWhiteboardResponse } from '@/utils/quizMediaAccess';

import { QuizAuthoringAdvisory } from './QuizAuthoringAdvisory';
import { RubricBuilderPanel } from './RubricBuilderPanel';
import { WordLimitFields } from './WordLimitFields';
import { FibBlanksEditor } from './FibBlanksEditor';
import { isMultiBlank } from '@/utils/quizFibBlanks';
import { ChoiceOptionsEditor } from './ChoiceOptionsEditor';
import { TargetChips } from '@/components/quiz/targets/TargetChips';
import { TargetPicker } from '@/components/quiz/targets/TargetPicker';
import { useStandardsFromPrompt } from '@/components/quiz/targets/useStandardsFromPrompt';
import {
  FibAnswerField,
  NeedsAnswerNotice,
  QuestionPromptField,
  QuestionTargetsField,
  QuestionTypeSelect,
} from './QuestionFields';
import {
  QUESTION_TYPES,
  questionTypeChangeUpdates,
} from './questionFieldUpdates';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import {
  countQuestionsNeedingKey,
  questionNeedsKey,
} from '@/utils/quizNeedsKey';
import type { QuizEditorController } from './useQuizEditorState';
import type { QuizGenType } from '@/utils/ai';

interface PaneProps {
  state: QuizEditorController;
  aiEnabled: boolean;
  /** Question-bank access; omitted when banks are unavailable. */
  bankApi?: QuizEditorBankApi;
  /** Rendered at the top of the pane (bank editor's targets strip). */
  titleSlot?: React.ReactNode;
  /** Bank-level tags every question inherits; rows render them muted. */
  inheritedTargets?: QuestionTargetTag[];
  /** Opens "Add answer key"; shown beside the needs-answer count when set (R31). */
  onAddAnswerKey?: () => void;
  /** Off in the bank editor, which doesn't save sections. */
  allowSections?: boolean;
}

/** Stable empty array reused as the matchingDistractors fallback. */
const EMPTY_DISTRACTORS: readonly string[] = Object.freeze([]);

/** Hoisted so SortableList's memoized id array survives re-renders. */
const getEntryId = (e: QuizOrderEntry) => e.id;

const TYPE_BADGE: Record<QuizQuestionType, string> = {
  MC: 'bg-blue-100 text-blue-700',
  FIB: 'bg-amber-100 text-amber-800',
  Matching: 'bg-purple-100 text-purple-700',
  Ordering: 'bg-teal-100 text-teal-700',
  MA: 'bg-emerald-100 text-emerald-700',
  'free-response': 'bg-rose-100 text-rose-700',
};

// ─── Context pane ────────────────────────────────────────────────────────────

/**
 * Slice comparator for the context pane. The controller object from
 * `useQuizEditorState` is rebuilt on every render, so the pane memoizes on
 * the specific slices it consumes (all controller callbacks are
 * referentially stable). This keeps chrome-only modal renders — isDirty /
 * saving flips, AI-overlay state — from re-rendering the question list.
 * If the pane starts consuming a new controller field, add it here or the
 * pane will render stale data.
 */
const quizContextPanePropsEqual = (prev: PaneProps, next: PaneProps): boolean =>
  prev.aiEnabled === next.aiEnabled &&
  prev.bankApi === next.bankApi &&
  prev.state.questions === next.state.questions &&
  prev.state.stimuli === next.state.stimuli &&
  prev.state.order === next.state.order &&
  prev.state.bankSlots === next.state.bankSlots &&
  prev.state.sections === next.state.sections &&
  prev.state.selectedId === next.state.selectedId &&
  prev.state.checkedIds === next.state.checkedIds &&
  prev.titleSlot === next.titleSlot &&
  prev.inheritedTargets === next.inheritedTargets &&
  prev.onAddAnswerKey === next.onAddAnswerKey &&
  prev.allowSections === next.allowSections &&
  prev.state.error === next.state.error;

export const QuizEditorContextPane = React.memo(function QuizEditorContextPane({
  state,
  aiEnabled,
  bankApi,
  titleSlot,
  inheritedTargets,
  onAddAnswerKey,
  allowSections = true,
}: PaneProps) {
  const { canAccessQuizMediaResponse, canAccessFeature } = useAuth();
  const mediaResponseAllowed = canAccessQuizMediaResponse();
  const stopsAllowed = canAccessFeature('quiz-import-versions');
  const {
    questions,
    stimuli,
    order,
    bankSlots,
    sections,
    addSection,
    updateSection,
    removeSection,
    selectedId,
    setSelectedId,
    addQuestion,
    deleteQuestion,
    duplicateQuestion,
    reorderEntries,
    addBankSlot,
    removeBankSlot,
    insertQuestions,
    checkedIds,
    toggleChecked,
    setAllChecked,
    deleteChecked,
    applyTargets,
    error,
    setShowAiPrompt,
  } = state;
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [saveToBankOpen, setSaveToBankOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [bankNotice, setBankNotice] = useState<string | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(addMenuRef, () => setAddMenuOpen(false));

  const questionsById = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions]
  );
  const slotsById = useMemo(
    () => new Map(bankSlots.map((s) => [s.id, s])),
    [bankSlots]
  );
  const sectionsById = useMemo(
    () => new Map(sections.map((s) => [s.id, s])),
    [sections]
  );
  const sectionCounts = useMemo(
    () =>
      sectionQuestionCounts(
        order,
        new Map(bankSlots.map((s) => [s.id, s.count ?? 0]))
      ),
    [order, bankSlots]
  );
  // A Stop on the last section has nothing after it, so that row offers none.
  const lastSectionId = [...order]
    .reverse()
    .find((e) => e.kind === 'section')?.id;
  // Question numbers skip slot rows so "Question 3" matches the detail pane.
  const questionNumberById = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const e of order) if (e.kind === 'question') map.set(e.id, n++);
    return map;
  }, [order]);
  const bankSources = bankApi?.sources;
  const eligibleBySlotId = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const s of bankSlots)
      map.set(s.id, slotEligibleFromSource(findSlotSource(bankSources, s), s));
    return map;
  }, [bankSlots, bankSources]);
  const checkedQuestions = useMemo(
    () => questions.filter((q) => checkedIds.has(q.id)),
    [questions, checkedIds]
  );
  const banksAvailable = !!bankApi && bankApi.sources.length > 0;
  const needsKeyCount = useMemo(
    () => countQuestionsNeedingKey(questions),
    [questions]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Settings strip */}
      <div className="px-5 py-4 border-b border-slate-200 space-y-3 bg-white shrink-0 empty:hidden">
        {titleSlot}
        {error && (
          <div className="p-2.5 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-lg flex items-center gap-2 text-xs text-brand-red-dark font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        {onAddAnswerKey && needsKeyCount > 0 && (
          <div
            role="status"
            className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-900 font-semibold"
          >
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
            <span className="flex-1">
              {needsKeyCount === 1
                ? '1 question still needs an answer.'
                : `${needsKeyCount} questions still need an answer.`}
            </span>
            <button
              type="button"
              onClick={onAddAnswerKey}
              {...tourTypeAttr('quiz-editor.add-answer-key', 'quiz')}
              className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-xs font-bold transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" aria-hidden />
              Add answer key
            </button>
          </div>
        )}
        {bankNotice && (
          <div
            role="status"
            className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800 font-semibold"
          >
            <Library className="w-4 h-4 shrink-0" aria-hidden />
            <span className="flex-1">{bankNotice}</span>
            <button
              type="button"
              onClick={() => setBankNotice(null)}
              aria-label="Dismiss"
              {...tourTypeAttr('quiz-editor.bank-notice-dismiss', 'quiz')}
              className="text-emerald-700 hover:text-emerald-900"
            >
              ×
            </button>
          </div>
        )}
        {/* Advisory, not validation: it never blocks a save and never shares
            the error styling. */}
        {mediaResponseAllowed && (
          <QuizAuthoringAdvisory questions={questions} />
        )}
      </div>

      {/* Question list */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-50 px-5 pb-5 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Questions ({questions.length})
            {bankSlots.length > 0 && (
              <span className="ml-1.5 normal-case tracking-normal font-semibold text-indigo-600">
                + {bankSlots.length} bank{' '}
                {bankSlots.length === 1 ? 'draw' : 'draws'}
              </span>
            )}
          </h4>
          <div className="flex items-center gap-2">
            {checkedIds.size > 0 && (
              <>
                <span className="text-xs font-semibold text-slate-600">
                  {checkedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={() => setBulkPickerOpen(true)}
                  {...tourTypeAttr('quiz-editor.bulk-tag', 'quiz')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                >
                  <Tag className="w-3.5 h-3.5" />
                  Tag
                </button>
                {bankApi && (
                  <button
                    type="button"
                    onClick={() => setSaveToBankOpen(true)}
                    {...tourTypeAttr('quiz-editor.bulk-save-bank', 'quiz')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                  >
                    <Library className="w-3.5 h-3.5" />
                    Save to bank…
                  </button>
                )}
                <button
                  type="button"
                  onClick={deleteChecked}
                  {...tourTypeAttr('quiz-editor.bulk-delete', 'quiz')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-red-50 border border-slate-300 text-red-600 rounded-lg text-xs font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setAllChecked(false)}
                  {...tourTypeAttr('quiz-editor.bulk-clear', 'quiz')}
                  className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Clear
                </button>
              </>
            )}
            {aiEnabled && (
              <button
                onClick={() => setShowAiPrompt(true)}
                {...tourTypeAttr('quiz-editor.draft-ai', 'quiz')}
                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                title="Generate questions with AI"
              >
                <Wand2 className="w-3.5 h-3.5 text-slate-500" />
                Draft with AI
              </button>
            )}
            {bankApi || allowSections ? (
              <div ref={addMenuRef} className="relative flex items-stretch">
                <button
                  type="button"
                  onClick={addQuestion}
                  className="flex items-center gap-1 pl-2.5 pr-2 py-1 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-l-lg text-xs font-bold transition-colors"
                  {...tourTypeAttr('quiz-editor.add-question', 'quiz')}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setAddMenuOpen((v) => !v)}
                  aria-label="More ways to add"
                  aria-haspopup="menu"
                  aria-expanded={addMenuOpen}
                  className="flex items-center px-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-r-lg border-l border-white/25 transition-colors"
                  {...tourTypeAttr('quiz-editor.add-menu', 'quiz')}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {addMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-20"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAddMenuOpen(false);
                        addQuestion();
                      }}
                      {...tourTypeAttr('quiz-editor.add-blank', 'quiz')}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Blank question
                    </button>
                    {allowSections && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAddMenuOpen(false);
                          addSection();
                        }}
                        {...tourTypeAttr('quiz-editor.add-section', 'quiz')}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Heading className="w-3.5 h-3.5" />
                        Section
                      </button>
                    )}
                    {bankApi && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!banksAvailable}
                        {...tourTypeAttr('quiz-editor.add-from-bank', 'quiz')}
                        onClick={() => {
                          setAddMenuOpen(false);
                          setBankPickerOpen(true);
                        }}
                        className="w-full flex items-start gap-2 px-3 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white"
                      >
                        <Shuffle className="w-3.5 h-3.5 mt-px shrink-0" />
                        <span>
                          From question bank…
                          {!banksAvailable && (
                            <span className="block font-normal text-slate-500">
                              Create a bank in the Banks tab first
                            </span>
                          )}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={addQuestion}
                className="flex items-center gap-1 px-2.5 py-1 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-lg text-xs font-bold transition-colors"
                {...tourTypeAttr('quiz-editor.add-question', 'quiz')}
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            )}
          </div>
        </div>

        {order.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8 border-2 border-dashed border-slate-300 rounded-lg bg-white">
            No questions yet.
          </div>
        ) : (
          <SortableList
            items={order}
            getId={getEntryId}
            onReorder={reorderEntries}
            renderItem={(entry, handle) => {
              if (entry.kind === 'section') {
                const section = sectionsById.get(entry.id);
                if (!section) return null;
                return (
                  <SectionRow
                    section={section}
                    questionCount={sectionCounts.get(section.id) ?? 0}
                    canStop={stopsAllowed && section.id !== lastSectionId}
                    onUpdate={updateSection}
                    onRemove={removeSection}
                    dragHandleAttributes={handle.attributes}
                    dragHandleListeners={handle.listeners}
                  />
                );
              }
              if (entry.kind === 'slot') {
                const slot = slotsById.get(entry.id);
                if (!slot) return null;
                return (
                  <BankSlotRow
                    slot={slot}
                    eligibleCount={eligibleBySlotId.get(slot.id) ?? null}
                    isSelected={slot.id === selectedId}
                    onSelect={setSelectedId}
                    onRemove={removeBankSlot}
                    dragHandleAttributes={handle.attributes}
                    dragHandleListeners={handle.listeners}
                  />
                );
              }
              const q = questionsById.get(entry.id);
              if (!q) return null;
              return (
                <QuestionRow
                  question={q}
                  index={questionNumberById.get(q.id) ?? 0}
                  isSelected={q.id === selectedId}
                  isChecked={checkedIds.has(q.id)}
                  onSelect={setSelectedId}
                  onToggleChecked={toggleChecked}
                  onDelete={deleteQuestion}
                  onDuplicate={duplicateQuestion}
                  dragHandleAttributes={handle.attributes}
                  dragHandleListeners={handle.listeners}
                  inheritedTargets={inheritedTargets}
                />
              );
            }}
            className="space-y-1.5"
          />
        )}
      </div>
      {bankPickerOpen && bankApi && (
        <BankPickerModal
          bankApi={bankApi}
          onClose={() => setBankPickerOpen(false)}
          onInsertQuestions={insertQuestions}
          onAddSlot={addBankSlot}
        />
      )}
      {saveToBankOpen && bankApi && (
        <SaveToBankModal
          bankApi={bankApi}
          questions={checkedQuestions}
          stimuli={stimuli}
          onClose={() => setSaveToBankOpen(false)}
          onSaved={(meta) => {
            setBankNotice(
              `Saved ${checkedQuestions.length} ${checkedQuestions.length === 1 ? 'question' : 'questions'} to "${meta.title}".`
            );
            setAllChecked(false);
          }}
        />
      )}
      {bulkPickerOpen && (
        <TargetPicker
          open
          initial={[]}
          allowReplace
          title={`Tag ${checkedIds.size} question${checkedIds.size === 1 ? '' : 's'}`}
          onApply={(tags, mode) => {
            applyTargets([...checkedIds], tags, mode);
            setBulkPickerOpen(false);
          }}
          onClose={() => setBulkPickerOpen(false)}
        />
      )}
    </div>
  );
}, quizContextPanePropsEqual);

// ─── Question row ────────────────────────────────────────────────────────────

interface QuestionRowProps {
  question: QuizQuestion;
  index: number;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: (id: string) => void;
  onToggleChecked: (id: string, range?: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  dragHandleAttributes: React.HTMLAttributes<HTMLElement>;
  dragHandleListeners: Record<string, (event: Event) => void> | undefined;
  inheritedTargets?: QuestionTargetTag[];
}

/**
 * Memo comparator for QuestionRow. Compares the question by reference (an
 * edit replaces the question object, so the edited row still re-renders its
 * preview text) and intentionally EXCLUDES the drag-handle props: dnd-kit
 * recreates `attributes`/`listeners` objects on every render, but for a
 * given sortable id they are functionally equivalent, so comparing them
 * would defeat the memo without changing behavior.
 */
const questionRowPropsEqual = (
  prev: QuestionRowProps,
  next: QuestionRowProps
): boolean =>
  prev.question === next.question &&
  prev.index === next.index &&
  prev.isSelected === next.isSelected &&
  prev.isChecked === next.isChecked &&
  prev.onSelect === next.onSelect &&
  prev.onToggleChecked === next.onToggleChecked &&
  prev.onDelete === next.onDelete &&
  prev.onDuplicate === next.onDuplicate &&
  prev.inheritedTargets === next.inheritedTargets;

const QuestionRow = React.memo(function QuestionRow({
  question,
  index,
  isSelected,
  isChecked,
  onSelect,
  onToggleChecked,
  onDelete,
  onDuplicate,
  dragHandleAttributes,
  dragHandleListeners,
  inheritedTargets,
}: QuestionRowProps) {
  const ownIds = new Set((question.targets ?? []).map((t) => t.id));
  const mutedTargets = (inheritedTargets ?? []).filter(
    (t) => !ownIds.has(t.id)
  );
  return (
    <div
      onClick={() => onSelect(question.id)}
      {...tourFieldAttr('quiz-editor.question-row', 'quiz', String(index + 1))}
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
            React.PointerEventHandler<HTMLButtonElement> | undefined
        }
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
        {...tourFieldAttr(
          'quiz-editor.question-drag',
          'quiz',
          String(index + 1)
        )}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none p-0.5"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <input
        type="checkbox"
        checked={isChecked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) =>
          onToggleChecked(
            question.id,
            (e.nativeEvent as MouseEvent).shiftKey === true
          )
        }
        aria-label={`Select question ${index + 1}`}
        {...tourFieldAttr(
          'quiz-editor.question-select',
          'quiz',
          String(index + 1)
        )}
        className={`shrink-0 accent-brand-blue-primary transition-opacity ${
          isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      />
      <span className="text-slate-400 font-mono font-bold text-xs w-5 shrink-0 text-center">
        {index + 1}
      </span>
      {question.sourceLabel && (
        <span className="shrink-0 text-slate-400 font-mono text-xxs">
          · printed {question.sourceLabel}
        </span>
      )}
      <span
        className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-xxs font-bold uppercase tracking-wider ${TYPE_BADGE[question.type]}`}
      >
        {question.type === 'free-response' ? 'FRQ' : question.type}
        {isFreeResponseType(question.type) && question.recording && (
          <>
            <Mic className="w-2.5 h-2.5" aria-hidden />
            <span className="sr-only">spoken</span>
          </>
        )}
      </span>
      {questionNeedsKey(question) && (
        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xxs font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
          <AlertCircle className="w-2.5 h-2.5" aria-hidden />
          Needs answer
        </span>
      )}
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm text-slate-700 truncate">
          {question.text || (
            <span className="italic text-slate-400">Untitled question</span>
          )}
        </span>
        {(question.targets?.length ?? 0) + mutedTargets.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            {question.targets && question.targets.length > 0 && (
              <TargetChips targets={question.targets} compact max={3} />
            )}
            {mutedTargets.length > 0 && (
              <TargetChips targets={mutedTargets} compact max={3} muted />
            )}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate(question.id);
        }}
        aria-label="Duplicate question"
        title="Duplicate question"
        {...tourFieldAttr(
          'quiz-editor.question-duplicate',
          'quiz',
          String(index + 1)
        )}
        className="text-slate-300 hover:text-brand-blue-primary hover:bg-slate-100 rounded-sm p-1 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(question.id);
        }}
        aria-label="Delete question"
        title="Delete question"
        {...tourFieldAttr(
          'quiz-editor.question-delete',
          'quiz',
          String(index + 1)
        )}
        className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-sm p-1 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}, questionRowPropsEqual);

// ─── Detail pane ─────────────────────────────────────────────────────────────

/**
 * Slice comparator for the detail pane — same contract as
 * `quizContextPanePropsEqual`: `questions` / `selectedQuestion` /
 * `selectedIndex` cover everything the pane renders; the per-question
 * handlers it consumes are all referentially stable.
 */
const quizDetailPanePropsEqual = (prev: PaneProps, next: PaneProps): boolean =>
  prev.bankApi === next.bankApi &&
  prev.state.questions === next.state.questions &&
  prev.state.selectedQuestion === next.state.selectedQuestion &&
  prev.state.selectedSlot === next.state.selectedSlot &&
  prev.state.selectedIndex === next.state.selectedIndex &&
  prev.state.stimuli === next.state.stimuli;

export const QuizEditorDetailPane = React.memo(function QuizEditorDetailPane({
  state,
  bankApi,
}: PaneProps) {
  const {
    selectedQuestion,
    selectedSlot,
    selectedIndex,
    questions,
    updateQuestion,
    updateBankSlot,
    removeBankSlot,
  } = state;
  const [pickerOpen, setPickerOpen] = useState(false);

  // Stable per-selection callbacks so the memoized Matching/Ordering answer
  // editors don't re-render on every prompt keystroke (their `onChange` prop
  // would otherwise be a fresh closure each render).
  const selectedQuestionId = selectedQuestion?.id ?? null;
  const handleMatchingChange = useCallback(
    (next: { correctAnswer: string; matchingDistractors: string[] }) => {
      if (selectedQuestionId) updateQuestion(selectedQuestionId, next);
    },
    [selectedQuestionId, updateQuestion]
  );
  const handleRecordingChange = useCallback(
    (updates: Partial<QuizQuestion>) => {
      if (selectedQuestionId) updateQuestion(selectedQuestionId, updates);
    },
    [selectedQuestionId, updateQuestion]
  );
  const handleOrderingChange = useCallback(
    (correctAnswer: string) => {
      if (selectedQuestionId)
        updateQuestion(selectedQuestionId, { correctAnswer });
    },
    [selectedQuestionId, updateQuestion]
  );

  const { user, canAccessQuizMediaResponse, canAccessFeature } = useAuth();
  // Fail-closed: no permission record means the controls never mount, so the
  // editor is pixel-identical to today for everyone else.
  const mediaResponseAllowed = canAccessQuizMediaResponse();
  const whiteboardAllowed = canAccessQuizWhiteboardResponse({
    canAccessQuizMediaResponse,
    canAccessFeature,
  });
  const uploadWhiteboardImage = useWhiteboardImageUpload();
  const rubricVisibilityOn = canAccessFeature('quiz-rubric-visibility');
  const spellCheckToggleOn = canAccessFeature('quiz-spell-check-toggle');
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const readPrompt = useCallback(() => promptRef.current?.value, []);
  const targetsRef = useRef(selectedQuestion?.targets);
  useLayoutEffect(() => {
    targetsRef.current = selectedQuestion?.targets;
  });
  const readTargets = useCallback(() => targetsRef.current, []);
  const promptStandards = useStandardsFromPrompt(
    updateQuestion,
    readPrompt,
    readTargets
  );
  const [showRubricBuilder, setShowRubricBuilder] = useState(false);
  // Manual points held aside per question while a rubric owns its points.
  const manualPointsByQuestion = useRef<Map<string, number>>(new Map());

  // Adjusting state while rendering: close the builder when the selection moves.
  const [lastSelectedId, setLastSelectedId] = useState(selectedQuestionId);
  if (lastSelectedId !== selectedQuestionId) {
    setLastSelectedId(selectedQuestionId);
    setShowRubricBuilder(false);
  }

  const selectedHasRubric = !!selectedQuestion?.rubricSnapshot;

  const handleAttachRubric = useCallback(
    (rubric: Rubric, rubricId?: string) => {
      if (!selectedQuestionId) return;
      if (!selectedHasRubric) {
        manualPointsByQuestion.current.set(
          selectedQuestionId,
          selectedQuestion?.points ?? 1
        );
      }
      updateQuestion(selectedQuestionId, {
        rubricId: rubricId ?? rubric.id,
        rubricSnapshot: rubric,
        points: rubricMaxPoints(rubric),
      });
      setShowRubricBuilder(false);
    },
    [
      selectedQuestionId,
      selectedHasRubric,
      selectedQuestion?.points,
      updateQuestion,
    ]
  );

  const handleDetachRubric = useCallback(() => {
    if (!selectedQuestionId) return;
    // No stash (rubric attached in an earlier session) — keep current points.
    const stashed = manualPointsByQuestion.current.get(selectedQuestionId);
    updateQuestion(selectedQuestionId, {
      rubricId: undefined,
      rubricSnapshot: undefined,
      rubricVisibleToStudents: undefined,
      points: stashed ?? selectedQuestion?.points ?? 1,
    });
    manualPointsByQuestion.current.delete(selectedQuestionId);
    setShowRubricBuilder(false);
  }, [selectedQuestionId, selectedQuestion?.points, updateQuestion]);

  if (selectedSlot) {
    return (
      <BankSlotDetail
        key={selectedSlot.id}
        slot={selectedSlot}
        bankApi={bankApi}
        onUpdate={updateBankSlot}
        onRemove={removeBankSlot}
        balancedAvailable={canAccessFeature('quiz-import-versions')}
        stimulusSection={
          <SlotStimulusSection
            state={state}
            slotId={selectedSlot.id}
            calculatorAvailable={canAccessFeature('quiz-calculator-stimulus')}
          />
        }
      />
    );
  }

  if (!selectedQuestion) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center px-8 py-12 text-slate-500">
        <MousePointerClick className="w-10 h-10 mb-3 text-slate-400" />
        <h4 className="text-base font-bold text-slate-700 mb-1">
          {questions.length === 0 ? 'No questions yet' : 'Pick a question'}
        </h4>
        {questions.length === 0 && (
          <p className="text-sm max-w-xs">
            Add a question or draft with AI to start editing.
          </p>
        )}
      </div>
    );
  }

  const q = selectedQuestion;
  const typeMeta = QUESTION_TYPES.find((entry) => entry.value === q.type);
  const timeLimitLockedByRecording = mediaResponseAllowed && !!q.recording;
  // Spoken answers on: Type, Format, Time limit and Points share one compact line.
  const compactRow = mediaResponseAllowed;

  return (
    // Not `relative`: the rubric builder anchors to the modal body so it can span both panes.
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
        <QuestionPromptField
          question={q}
          onChange={(updates) => updateQuestion(q.id, updates)}
          onBlur={() =>
            void promptStandards.onPromptBlur(q.id, q.text, q.targets)
          }
          textareaRef={promptRef}
        />

        {/* Learning targets */}
        <QuestionTargetsField
          question={q}
          onChange={(targets) => updateQuestion(q.id, { targets })}
          promptStandards={promptStandards}
          pickerOpen={pickerOpen}
          onPickerOpenChange={setPickerOpen}
        />

        {/* Type / format / time / points row */}
        <div
          className={
            compactRow
              ? 'flex flex-wrap items-start gap-3'
              : 'grid grid-cols-3 gap-3'
          }
        >
          <div className={compactRow ? 'min-w-40 flex-1' : undefined}>
            <label className={labelClass}>Type</label>
            <QuestionTypeSelect
              question={q}
              onSelect={(nextType) => {
                const updates = questionTypeChangeUpdates(q, nextType, {
                  mediaResponseAllowed,
                  stashedPoints: manualPointsByQuestion.current.get(q.id),
                });
                if (!updates) return;
                if (!isFreeResponseType(nextType) && q.rubricSnapshot)
                  manualPointsByQuestion.current.delete(q.id);
                updateQuestion(q.id, updates);
              }}
            />
          </div>
          {compactRow && isFreeResponseType(q.type) && (
            <div className="min-w-32 flex-1">
              <ResponseFormatControl
                question={q}
                onChange={handleRecordingChange}
                whiteboardAllowed={whiteboardAllowed}
              />
            </div>
          )}
          {/* A recording question's own thinking time and recording limit own the clock. */}
          {!timeLimitLockedByRecording && (
            <div className={compactRow ? 'w-28 shrink-0' : undefined}>
              <label className={labelClass} htmlFor="question-time-limit">
                Time Limit
              </label>
              <DraftNumberInput
                id="question-time-limit"
                integer
                min={0}
                max={300}
                value={q.timeLimit}
                onCommit={(timeLimit) => updateQuestion(q.id, { timeLimit })}
                unit="Sec"
                anchor={tourTypeAttr('quiz-editor.time-limit', 'quiz')}
              />
            </div>
          )}
          <div
            className={compactRow ? 'w-20 shrink-0' : undefined}
            title={
              compactRow && q.rubricSnapshot
                ? 'Points come from the attached rubric.'
                : undefined
            }
          >
            <label className={labelClass}>Points</label>
            <DraftNumberInput
              integer
              min={1}
              max={100}
              value={q.points ?? 1}
              aria-label="Points"
              disabled={!!q.rubricSnapshot}
              aria-describedby={
                q.rubricSnapshot && !compactRow
                  ? 'question-points-rubric-hint'
                  : undefined
              }
              onCommit={(points) => updateQuestion(q.id, { points })}
              className="disabled:bg-slate-100 disabled:text-slate-600"
              anchor={tourTypeAttr('quiz-editor.points', 'quiz')}
            />
            {q.rubricSnapshot && !compactRow && (
              <p
                id="question-points-rubric-hint"
                className="mt-1 text-xs text-slate-600"
              >
                Points come from the attached rubric.
              </p>
            )}
          </div>
        </div>

        {/* Only an import writes a printed number, so only those questions show the field. */}
        {q.sourceLabel !== undefined && (
          <div className="max-w-48">
            <label className={labelClass} htmlFor="question-source-label">
              Printed number
            </label>
            <input
              id="question-source-label"
              type="text"
              value={q.sourceLabel ?? ''}
              onChange={(e) =>
                updateQuestion(q.id, { sourceLabel: e.target.value })
              }
              placeholder="e.g. 2·3"
              className={inputClass}
              {...tourTypeAttr('quiz-editor.printed-number', 'quiz')}
            />
          </div>
        )}

        {isFreeResponseType(q.type) && mediaResponseAllowed && (
          <SpokenResponseSettings
            question={q}
            onChange={handleRecordingChange}
            whiteboardAllowed={whiteboardAllowed}
            onUploadWhiteboardImage={uploadWhiteboardImage}
          />
        )}

        {(q.type === 'Matching' ||
          q.type === 'Ordering' ||
          isMultiBlank(q)) && (
          <div className="flex items-start gap-2">
            <label
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg cursor-pointer select-none shrink-0"
              title={
                q.type === 'Matching'
                  ? 'Award partial points based on the number of correct pairs.'
                  : q.type === 'FIB'
                    ? 'Award points for each blank filled in correctly.'
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
                {...tourTypeAttr('quiz-editor.partial-credit', 'quiz')}
              />
              <span className="font-bold text-xs text-slate-700 whitespace-nowrap">
                Partial credit
              </span>
            </label>
          </div>
        )}

        {/* Type-specific answer editor */}
        {q.type === 'MC' || q.type === 'MA' ? (
          <div className="space-y-1">
            <ChoiceOptionsEditor
              key={q.id}
              question={q}
              onChange={(updates) => updateQuestion(q.id, updates)}
            />
            <NeedsAnswerNotice
              question={q}
              className="flex items-center gap-1 text-xxs font-bold text-amber-700"
            />
          </div>
        ) : q.type === 'Matching' ? (
          <MatchingAnswerEditor
            correctAnswer={q.correctAnswer}
            matchingDistractors={
              q.matchingDistractors ?? (EMPTY_DISTRACTORS as string[])
            }
            onChange={handleMatchingChange}
          />
        ) : q.type === 'Ordering' ? (
          <OrderingAnswerEditor
            correctAnswer={q.correctAnswer}
            onChange={handleOrderingChange}
          />
        ) : isFreeResponseType(q.type) ? (
          <div className="space-y-3">
            {!timeLimitLockedByRecording && (
              <>
                <div>
                  <label className={labelClass}>Placeholder (optional)</label>
                  <input
                    type="text"
                    value={q.placeholder ?? ''}
                    onChange={(e) =>
                      updateQuestion(q.id, {
                        placeholder: e.target.value || undefined,
                      })
                    }
                    placeholder="e.g. Cite at least two pieces of evidence."
                    className={inputClass}
                    {...tourTypeAttr('quiz-editor.placeholder', 'quiz')}
                  />
                </div>
                <WordLimitFields
                  question={q}
                  onChange={(updates) => updateQuestion(q.id, updates)}
                />
                {spellCheckToggleOn && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={q.noSpellCheck !== true}
                      onChange={(e) =>
                        updateQuestion(q.id, {
                          noSpellCheck: e.target.checked ? undefined : true,
                        })
                      }
                      className="w-4 h-4 accent-brand-blue-primary"
                      {...tourTypeAttr('quiz-editor.spell-check', 'quiz')}
                    />
                    <span className="font-bold text-xs text-slate-700">
                      Spell check
                    </span>
                  </label>
                )}
              </>
            )}
            <div>
              <label className={labelClass}>Rubric</label>
              {q.rubricSnapshot ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-slate-700 font-bold">
                    {q.rubricSnapshot.title || 'Untitled rubric'}
                  </span>
                  <button
                    onClick={() => setShowRubricBuilder(true)}
                    className="px-2.5 py-1 border border-slate-300 rounded-lg text-xs font-bold text-slate-700"
                    {...tourTypeAttr('quiz-editor.rubric-edit', 'quiz')}
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleDetachRubric}
                    className="px-2.5 py-1 border border-rose-200 rounded-lg text-xs font-bold text-rose-700"
                    {...tourTypeAttr('quiz-editor.rubric-detach', 'quiz')}
                  >
                    Detach
                  </button>
                  {rubricVisibilityOn && (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={q.rubricVisibleToStudents === true}
                        onChange={(e) =>
                          updateQuestion(q.id, {
                            rubricVisibleToStudents: e.target.checked
                              ? true
                              : undefined,
                          })
                        }
                        className="w-4 h-4 accent-brand-blue-primary"
                        {...tourTypeAttr(
                          'quiz-editor.rubric-show-students',
                          'quiz'
                        )}
                      />
                      <span className="font-bold text-xs text-slate-700 whitespace-nowrap">
                        Show to students
                      </span>
                    </label>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowRubricBuilder(true)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700"
                  {...tourTypeAttr('quiz-editor.rubric-attach', 'quiz')}
                >
                  Attach Rubric
                </button>
              )}
            </div>
          </div>
        ) : isMultiBlank(q) ? (
          <div>
            <FibBlanksEditor
              question={q}
              onChange={(updates) => updateQuestion(q.id, updates)}
            />
            <NeedsAnswerNotice
              question={q}
              className="mt-1 flex items-center gap-1 text-xxs font-bold text-amber-700"
            />
          </div>
        ) : (
          <FibAnswerField
            question={q}
            onChange={(updates) => updateQuestion(q.id, updates)}
          />
        )}

        {/* Per-question stimulus attach — second entry point alongside the
            quiz-level Stimuli tab; both edit the same array. */}
        <QuestionStimulusSection
          state={state}
          questionId={q.id}
          calculatorAvailable={canAccessFeature('quiz-calculator-stimulus')}
        />
      </div>

      {showRubricBuilder && isFreeResponseType(q.type) && (
        <RubricBuilderPanel
          key={q.id}
          questionId={q.id}
          existingSnapshot={q.rubricSnapshot}
          onAttach={handleAttachRubric}
          onDetach={handleDetachRubric}
          onClose={() => setShowRubricBuilder(false)}
          teacherUid={user?.uid ?? ''}
        />
      )}
    </div>
  );
}, quizDetailPanePropsEqual);

// ─── AI overlay ──────────────────────────────────────────────────────────────

interface AiOverlayProps {
  state: QuizEditorController;
}

const QUIZ_TYPE_STEPPER_ROWS: ReadonlyArray<{
  type: QuizGenType;
  label: string;
}> = [
  { type: 'MC', label: 'Multiple Choice' },
  { type: 'FIB', label: 'Fill in the Blank' },
  { type: 'Matching', label: 'Matching' },
  { type: 'Ordering', label: 'Ordering' },
  { type: 'MA', label: 'Choose All That Apply' },
];

export const QuizAiOverlay: React.FC<AiOverlayProps> = ({ state }) => {
  const { canAccessFeature } = useAuth();
  const {
    showAiPrompt,
    setShowAiPrompt,
    aiPrompt,
    setAiPrompt,
    aiTypeCounts,
    setAiTypeCount,
    aiTotalCount,
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
      title="Draft with AI"
      description="New questions are added to the end."
      generating={aiGenerating}
      canGenerate={!!aiPrompt.trim() && !aiFileExtracting && aiTotalCount > 0}
      onGenerate={() => void runAiGenerate()}
      error={aiError}
      generateLabel="Generate Quiz"
      closeAnchor={tourTypeAttr('quiz-editor.ai-close', 'quiz')}
      generateAnchor={tourTypeAttr('quiz-editor.ai-generate', 'quiz')}
    >
      <textarea
        value={aiPrompt}
        onChange={(e) => setAiPrompt(e.target.value)}
        placeholder="e.g. A quiz about the solar system for 3rd graders."
        className={`${AI_PROMPT_TEXTAREA_CLASS} h-24!`}
        autoFocus
        aria-label="Describe your quiz"
        {...tourTypeAttr('quiz-editor.ai-prompt', 'quiz')}
      />
      <div>
        <div className="flex items-center justify-between text-xxs font-black text-slate-400 uppercase tracking-widest mb-1">
          <span>Question Mix</span>
          <span>Total: {aiTotalCount}</span>
        </div>
        <ul className="divide-y divide-slate-100 border-y border-slate-200">
          {QUIZ_TYPE_STEPPER_ROWS.map((row) => {
            const value = aiTypeCounts[row.type];
            return (
              <li key={row.type} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-700">
                    {row.label}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAiTypeCount(row.type, value - 1)}
                    disabled={value <= 0 || aiGenerating}
                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Decrease ${row.label} count`}
                    {...tourFieldAttr(
                      'quiz-editor.ai-count-dec',
                      'quiz',
                      row.type
                    )}
                  >
                    –
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-slate-800 tabular-nums">
                    {value}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAiTypeCount(row.type, value + 1)}
                    disabled={value >= 15 || aiGenerating}
                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Increase ${row.label} count`}
                    {...tourFieldAttr(
                      'quiz-editor.ai-count-inc',
                      'quiz',
                      row.type
                    )}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {canAccessFeature('ai-file-context') && (
        <DriveFileAttachment
          onFileContent={(content, name) => setAiFile(content, name)}
          onExtractingChange={setAiFileExtracting}
          disabled={aiGenerating}
          anchor={tourTypeAttr('quiz-editor.ai-attach-file', 'quiz')}
        />
      )}
    </AIGeneratorOverlay>
  );
};
