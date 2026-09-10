/**
 * QuizEditorModal — full-screen modal editor for a quiz.
 *
 * Wraps the two-pane EditorWorkspace: left context pane has the title +
 * folder picker + sortable questions list; right detail pane has the editor
 * for the currently-selected question (type / time / points / answer).
 *
 * A Questions/Settings segmented toggle in the context pane lets teachers
 * configure behavior settings (mode, integrity, gamification) while building
 * the quiz. The behavior is persisted via the `behavior` 2nd arg of `onSave`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, Sparkles, Target } from 'lucide-react';
import {
  LibraryFolder,
  QUESTION_BANK_SIZE_WARN,
  QuestionTargetTag,
  QuizBankSlot,
  QuizBehaviorSettings,
  QuizData,
  QuizOrderEntry,
  QuizQuestion,
  QuizStimulus,
  Rubric,
  isFreeResponseType,
} from '@/types';
import type { BankSource } from '@/hooks/useBankSources';
import type { UseQuestionBanksResult } from '@/hooks/useQuestionBanks';
import type { BankContent } from '@/utils/questionBanks';
import { EditorWorkspace } from '@/components/common/EditorWorkspace';
import { useAuth } from '@/context/useAuth';
import { QuizBehaviorSettingsPanel } from '@/components/common/library/QuizBehaviorSettingsPanel';
import {
  QuizAiOverlay,
  QuizEditorContextPane,
  QuizEditorDetailPane,
} from './QuizEditor';
import { StimulusManagerPanel } from './StimulusManagerPanel';
import { useQuizEditorState } from './useQuizEditorState';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import { QuizLanguageField } from './QuizLanguageField';
import { sanitizeStimulusPointers } from '@/utils/quizStimuli';
import { quizOrder } from '@/utils/questionBanks';
import { TargetChips } from '@/components/quiz/targets/TargetChips';
import { TargetPicker } from '@/components/quiz/targets/TargetPicker';

/** Bank access the editor needs for the picker, slot rows and "Save to bank". */
export interface QuizEditorBankApi {
  sources: BankSource[];
  loadBankContent(source: BankSource): Promise<BankContent>;
  appendQuestionsToBank: UseQuestionBanksResult['appendQuestionsToBank'];
}

interface QuizEditorModalProps {
  isOpen: boolean;
  quiz: QuizData | null;
  /** Omit to hide every question-bank affordance. */
  bankApi?: QuizEditorBankApi;
  onClose: () => void;
  onSave: (
    updatedQuiz: QuizData,
    behavior: QuizBehaviorSettings
  ) => Promise<void>;
  /** Folders for the FolderSelectField. Omit to hide the field. */
  folders?: LibraryFolder[];
  /** Current folder id for this quiz (null = root). */
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  /**
   * Seed behavior for the Settings tab. For an existing quiz, pass
   * `getQuizBehavior(meta)`; for a new quiz, omit (defaults to
   * `DEFAULT_QUIZ_BEHAVIOR`).
   */
  behavior?: QuizBehaviorSettings;
  /** 'bank' hides run settings and edits a question bank's shared content. */
  mode?: 'quiz' | 'bank';
  /** Bank mode: tags inherited by every question in the bank. */
  bankTargets?: QuestionTargetTag[];
  onBankTargetsChange?: (tags: QuestionTargetTag[]) => void;
  /** Bank mode: the owner tracks target edits; folds into isDirty. */
  bankTargetsDirty?: boolean;
  /** Overrides the AI feature gate (bank mode uses 'question-bank-ai'). */
  aiAllowed?: boolean;
}

const stimuliEqual = (a: QuizStimulus[], b: QuizStimulus[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const sa = a[i];
    const sb = b[i];
    if (
      sa.id !== sb.id ||
      sa.type !== sb.type ||
      sa.url !== sb.url ||
      (sa.driveFileId ?? '') !== (sb.driveFileId ?? '') ||
      sa.label !== sb.label ||
      (sa.playLimit ?? 0) !== (sb.playLimit ?? 0)
    ) {
      return false;
    }
  }
  return true;
};

// Order-stable projection of a rubric snapshot's meaningful fields, so a
// rubric edit that leaves `points` unchanged still reads as dirty.
const rubricSnapshotKey = (rubric: Rubric | undefined): string =>
  rubric
    ? JSON.stringify([
        rubric.id,
        rubric.title,
        rubric.description ?? '',
        rubric.criteria.map((c) => [
          c.id,
          c.name,
          c.description ?? '',
          c.levels.map((l) => [l.id, l.label, l.points, l.description ?? '']),
        ]),
      ])
    : '';

/** Absent block and present block never collide: '' vs a 4-field key. */
const recordingKey = (recording: QuizQuestion['recording']): string =>
  recording
    ? `${recording.prepSeconds}|${recording.limitSeconds}|${recording.prepExpiry}|${recording.takeLimit ?? 'null'}`
    : '';

const questionsEqual = (a: QuizQuestion[], b: QuizQuestion[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const qa = a[i];
    const qb = b[i];
    if (
      qa.id !== qb.id ||
      qa.text !== qb.text ||
      qa.type !== qb.type ||
      qa.correctAnswer !== qb.correctAnswer ||
      qa.timeLimit !== qb.timeLimit ||
      (qa.points ?? 1) !== (qb.points ?? 1) ||
      (qa.allowPartialCredit === true) !== (qb.allowPartialCredit === true) ||
      qa.incorrectAnswers.length !== qb.incorrectAnswers.length ||
      (qa.placeholder ?? '') !== (qb.placeholder ?? '') ||
      (qa.maxWords ?? 0) !== (qb.maxWords ?? 0) ||
      (qa.stimulusIds ?? []).join('|') !== (qb.stimulusIds ?? []).join('|') ||
      (qa.rubricId ?? '') !== (qb.rubricId ?? '') ||
      recordingKey(qa.recording) !== recordingKey(qb.recording) ||
      rubricSnapshotKey(qa.rubricSnapshot) !==
        rubricSnapshotKey(qb.rubricSnapshot)
    ) {
      return false;
    }
    for (let j = 0; j < qa.incorrectAnswers.length; j++) {
      if (qa.incorrectAnswers[j] !== qb.incorrectAnswers[j]) return false;
    }
    const aDistractors = qa.matchingDistractors ?? [];
    const bDistractors = qb.matchingDistractors ?? [];
    if (aDistractors.length !== bDistractors.length) return false;
    for (let j = 0; j < aDistractors.length; j++) {
      if (aDistractors[j] !== bDistractors[j]) return false;
    }
  }
  return true;
};

/**
 * Shallow-equal over the union of both objects' keys. Sufficient for
 * session-options objects, whose values are all primitives. Matches the
 * previous `JSON.stringify(a) !== JSON.stringify(b)` dirty-check semantics
 * (explicit `undefined` == absent) without serializing on every keystroke.
 * Tolerates a missing object on either side (legacy Firestore docs may lack
 * sessionOptions despite the type) — the old stringify compare did too.
 */
const shallowRecordEqual = <T extends object>(
  a: T | undefined,
  b: T | undefined
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof T)[]);
  for (const key of keys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
};

const bankSlotsEqual = (a: QuizBankSlot[], b: QuizBankSlot[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const sa = a[i];
    const sb = b[i];
    if (
      sa.id !== sb.id ||
      sa.bankId !== sb.bankId ||
      (sa.syncGroupId ?? '') !== (sb.syncGroupId ?? '') ||
      sa.mode !== sb.mode ||
      (sa.count ?? 0) !== (sb.count ?? 0) ||
      (sa.points ?? 1) !== (sb.points ?? 1) ||
      (sa.targetFilter ?? []).join('|') !== (sb.targetFilter ?? []).join('|')
    ) {
      return false;
    }
  }
  return true;
};

const orderEqual = (a: QuizOrderEntry[], b: QuizOrderEntry[]): boolean =>
  a.length === b.length &&
  a.every((e, i) => e.kind === b[i].kind && e.id === b[i].id);

/** Field-by-field QuizBehaviorSettings compare for the isDirty check. */
const quizBehaviorSettingsEqual = (
  a: QuizBehaviorSettings,
  b: QuizBehaviorSettings
): boolean =>
  a === b ||
  (a.sessionMode === b.sessionMode &&
    a.attemptLimit === b.attemptLimit &&
    shallowRecordEqual(a.sessionOptions, b.sessionOptions));

export const QuizEditorModal: React.FC<QuizEditorModalProps> = ({
  isOpen,
  quiz,
  bankApi,
  onClose,
  onSave,
  folders,
  folderId,
  onFolderChange,
  behavior: behaviorSeed,
  mode = 'quiz',
  bankTargets,
  onBankTargetsChange,
  bankTargetsDirty = false,
  aiAllowed,
}) => {
  const { canAccessFeature } = useAuth();
  const isBank = mode === 'bank';
  const aiEnabled = aiAllowed ?? canAccessFeature('gemini-functions');
  const readAloudAvailable = canAccessFeature('quiz-read-aloud');
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);

  const editorState = useQuizEditorState({
    quiz,
    inheritedTargets: isBank ? bankTargets : undefined,
  });

  const {
    title,
    questions,
    stimuli,
    language,
    setLanguage,
    saving,
    setSaving,
    setError,
    setShowAiPrompt,
    showAiPrompt,
    originalTitle,
    originalQuestions,
    originalStimuli,
    originalLanguage,
    bankSlots,
    order,
    originalBankSlots,
    originalOrder,
  } = editorState;

  // ─── Behavior settings state ─────────────────────────────────────────────
  const [editorTab, setEditorTab] = useState<
    'questions' | 'stimuli' | 'settings'
  >('questions');
  const [behavior, setBehavior] = useState<QuizBehaviorSettings>(
    () => behaviorSeed ?? DEFAULT_QUIZ_BEHAVIOR
  );
  const [originalBehavior, setOriginalBehavior] =
    useState<QuizBehaviorSettings>(() => behaviorSeed ?? DEFAULT_QUIZ_BEHAVIOR);

  // Re-seed behavior when the quiz being edited changes (e.g. user closes
  // editor and opens a different quiz without unmounting the modal). Adjust
  // state while rendering (see CLAUDE.md), keyed on quiz?.id only so a fresh
  // behaviorSeed object from a parent re-render doesn't clobber in-progress
  // edits.
  const [seededQuizId, setSeededQuizId] = useState(quiz?.id);
  if (seededQuizId !== quiz?.id) {
    setSeededQuizId(quiz?.id);
    const seed = behaviorSeed ?? DEFAULT_QUIZ_BEHAVIOR;
    setBehavior(seed);
    setOriginalBehavior(seed);
  }

  // Reference equality first — setState produces a new questions array on
  // every edit, so the deep walk only runs as a fallback.
  const isDirty = useMemo(
    () =>
      title !== originalTitle ||
      language !== originalLanguage ||
      !(
        questions === originalQuestions ||
        questionsEqual(questions, originalQuestions)
      ) ||
      !(
        stimuli === originalStimuli || stimuliEqual(stimuli, originalStimuli)
      ) ||
      !(
        bankSlots === originalBankSlots ||
        bankSlotsEqual(bankSlots, originalBankSlots)
      ) ||
      !(order === originalOrder || orderEqual(order, originalOrder)) ||
      bankTargetsDirty ||
      !quizBehaviorSettingsEqual(behavior, originalBehavior),
    [
      bankTargetsDirty,
      title,
      originalTitle,
      language,
      originalLanguage,
      questions,
      originalQuestions,
      stimuli,
      originalStimuli,
      bankSlots,
      originalBankSlots,
      order,
      originalOrder,
      behavior,
      originalBehavior,
    ]
  );

  // Global Escape listener so the AI overlay dismisses even when focus is
  // outside its children (e.g., user clicked the backdrop).
  useEffect(() => {
    if (!showAiPrompt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setShowAiPrompt(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAiPrompt, setShowAiPrompt]);

  const handleSave = async () => {
    if (!quiz) return;
    const errors: string[] = [];
    if (!title.trim())
      errors.push(isBank ? 'Bank title is required' : 'Quiz title is required');
    if (questions.length === 0 && bankSlots.length === 0)
      errors.push('Add at least one question');
    bankSlots.forEach((s) => {
      if (s.mode === 'random' && (s.count ?? 0) < 1)
        errors.push(
          `"${s.bankTitle}" draws 0 questions. Set how many to draw or remove the slot.`
        );
    });
    questions.forEach((q, i) => {
      if (!q.text.trim()) errors.push(`Question ${i + 1}: text is required`);
      // Free-response questions have no correct answer — they
      // are manually graded by the teacher after the quiz closes.
      const isWritten = isFreeResponseType(q.type);
      if (!isWritten && !q.correctAnswer.trim())
        errors.push(`Question ${i + 1}: correct answer is required`);
    });
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Belt-and-braces pointer cleanup: deleteStimulus already strips ids
      // live, but a save must never persist a dangling pointer.
      const cleanQuestions = sanitizeStimulusPointers(questions, stimuli);
      // `order` only carries information when a slot sits between questions.
      const cleanOrder = quizOrder({
        questions: cleanQuestions,
        bankSlots,
        order,
      });
      await onSave(
        {
          ...quiz,
          title: title.trim(),
          questions: cleanQuestions,
          ...(stimuli.length > 0 ? { stimuli } : { stimuli: undefined }),
          ...(language ? { language } : { language: undefined }),
          ...(bankSlots.length > 0
            ? { bankSlots, order: cleanOrder }
            : { bankSlots: undefined, order: undefined }),
          updatedAt: Date.now(),
        },
        isBank ? DEFAULT_QUIZ_BEHAVIOR : behavior
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Stable chrome elements so the shell's memoized header/footer don't
  // re-render on question-content keystrokes.
  const oversized = isBank && questions.length > QUESTION_BANK_SIZE_WARN;
  const subtitle = useMemo(
    () => (
      <span className="inline-flex items-center gap-2">
        <span>
          {questions.length} {questions.length === 1 ? 'question' : 'questions'}
        </span>
        {oversized && (
          <span
            role="status"
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xxs font-bold uppercase tracking-wider text-amber-800"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Over {QUESTION_BANK_SIZE_WARN} — consider splitting this bank
          </span>
        )}
      </span>
    ),
    [questions.length, oversized]
  );
  const footerExtras = useMemo(
    () =>
      aiEnabled ? (
        <button
          onClick={() => setShowAiPrompt(true)}
          className="h-[36px] px-3 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-2 active:scale-95"
          title="Generate with AI"
        >
          <Sparkles className="w-4 h-4" />
          Draft with AI
        </button>
      ) : null,
    [aiEnabled, setShowAiPrompt]
  );

  const bankTargetsStrip = isBank ? (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xxs font-bold uppercase tracking-wider text-slate-500">
          <Target className="h-3 w-3" aria-hidden="true" />
          Bank targets
        </span>
        {bankTargets && bankTargets.length > 0 && (
          <TargetChips
            targets={bankTargets}
            onRemove={
              onBankTargetsChange
                ? (id) =>
                    onBankTargetsChange(bankTargets.filter((t) => t.id !== id))
                : undefined
            }
          />
        )}
        {onBankTargetsChange && (
          <button
            type="button"
            onClick={() => setTargetPickerOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Add
          </button>
        )}
      </div>
      <p className="text-xxs text-slate-500">
        Every question in this bank inherits these targets.
      </p>
    </div>
  ) : undefined;

  if (!quiz) return null;

  const activeTab = isBank ? 'questions' : editorTab;

  return (
    <EditorWorkspace
      key={quiz.id}
      isOpen={isOpen}
      title={
        title.trim() ||
        (isBank
          ? originalTitle
            ? 'Edit Bank'
            : 'New Bank'
          : originalTitle
            ? 'Edit Quiz'
            : 'New Quiz')
      }
      subtitle={subtitle}
      isDirty={isDirty}
      isSaving={saving}
      onSave={handleSave}
      onClose={onClose}
      saveLabel={isBank ? 'Save Bank' : 'Save Quiz'}
      footerExtras={footerExtras}
      contextPane={
        <div className="flex flex-col h-full">
          {/* Questions / Settings segmented tab toggle (quiz mode only) */}
          {!isBank && (
            <div className="px-4 pt-3 pb-0 border-b border-slate-200 bg-white shrink-0 flex gap-1">
              {(['questions', 'stimuli', 'settings'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setEditorTab(tab)}
                  className={`px-3 py-2 rounded-t-lg text-xs font-black uppercase tracking-wider transition-colors ${
                    editorTab === tab
                      ? 'bg-brand-blue-primary text-white'
                      : 'text-slate-500 hover:text-brand-blue-primary hover:bg-brand-blue-lighter/30'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'questions' ? (
            <QuizEditorContextPane
              state={editorState}
              aiEnabled={aiEnabled}
              bankApi={isBank ? undefined : bankApi}
              folders={folders}
              folderId={folderId}
              onFolderChange={onFolderChange}
              shuffleQuestionsEnabled={
                behavior.sessionMode === 'student' &&
                behavior.sessionOptions.shuffleQuestions === true
              }
              titleSlot={bankTargetsStrip}
              titlePlaceholder={isBank ? 'Bank title' : undefined}
              inheritedTargets={isBank ? bankTargets : undefined}
            />
          ) : activeTab === 'stimuli' ? (
            <StimulusManagerPanel
              state={editorState}
              readAloudAvailable={readAloudAvailable}
            />
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 px-5 py-5 space-y-5">
              {readAloudAvailable && (
                <QuizLanguageField value={language} onChange={setLanguage} />
              )}
              <QuizBehaviorSettingsPanel
                value={behavior}
                onChange={setBehavior}
                readAloudAvailable={readAloudAvailable}
              />
            </div>
          )}
        </div>
      }
      detailPane={
        activeTab === 'questions' ? (
          <QuizEditorDetailPane
            state={editorState}
            aiEnabled={aiEnabled}
            bankApi={isBank ? undefined : bankApi}
          />
        ) : activeTab === 'stimuli' ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm px-8 text-center">
            <p>
              Stimuli save with the quiz. Students see them beside the questions
              you assign them to — doc-shaped stimuli open in a side panel,
              media renders above the question.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm px-8 text-center">
            <p>
              Settings saved with the quiz are the defaults for live sessions
              and new assignments — you can adjust them per assignment in the
              Assign dialog.
            </p>
          </div>
        )
      }
      overlay={
        <>
          <QuizAiOverlay state={editorState} />
          {targetPickerOpen && onBankTargetsChange && (
            <TargetPicker
              open
              initial={bankTargets ?? []}
              title="Bank targets"
              onApply={(tags) => {
                const seen = new Set((bankTargets ?? []).map((t) => t.id));
                onBankTargetsChange([
                  ...(bankTargets ?? []),
                  ...tags.filter((t) => !seen.has(t.id)),
                ]);
                setTargetPickerOpen(false);
              }}
              onClose={() => setTargetPickerOpen(false)}
            />
          )}
        </>
      }
    />
  );
};
