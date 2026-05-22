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
import { Sparkles } from 'lucide-react';
import {
  LibraryFolder,
  QuizBehaviorSettings,
  QuizData,
  QuizQuestion,
} from '@/types';
import { EditorWorkspace } from '@/components/common/EditorWorkspace';
import { useAuth } from '@/context/useAuth';
import { QuizBehaviorSettingsPanel } from '@/components/common/library/QuizBehaviorSettingsPanel';
import {
  QuizAiOverlay,
  QuizEditorContextPane,
  QuizEditorDetailPane,
} from './QuizEditor';
import { useQuizEditorState } from './useQuizEditorState';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';

interface QuizEditorModalProps {
  isOpen: boolean;
  quiz: QuizData | null;
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
}

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
      (qa.maxWords ?? 0) !== (qb.maxWords ?? 0)
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

export const QuizEditorModal: React.FC<QuizEditorModalProps> = ({
  isOpen,
  quiz,
  onClose,
  onSave,
  folders,
  folderId,
  onFolderChange,
  behavior: behaviorSeed,
}) => {
  const { canAccessFeature } = useAuth();
  const aiEnabled = canAccessFeature('gemini-functions');

  const editorState = useQuizEditorState({ quiz });

  const {
    title,
    questions,
    saving,
    setSaving,
    setError,
    setShowAiPrompt,
    showAiPrompt,
    originalTitle,
    originalQuestions,
  } = editorState;

  // ─── Behavior settings state ─────────────────────────────────────────────
  const [editorTab, setEditorTab] = useState<'questions' | 'settings'>(
    'questions'
  );
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

  const isDirty = useMemo(
    () =>
      title !== originalTitle ||
      !questionsEqual(questions, originalQuestions) ||
      JSON.stringify(behavior) !== JSON.stringify(originalBehavior),
    [
      title,
      originalTitle,
      questions,
      originalQuestions,
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
    if (!title.trim()) errors.push('Quiz title is required');
    if (questions.length === 0) errors.push('Add at least one question');
    questions.forEach((q, i) => {
      if (!q.text.trim()) errors.push(`Question ${i + 1}: text is required`);
      // Written response types (short/essay) have no correct answer — they
      // are manually graded by the teacher after the quiz closes.
      const isWritten = q.type === 'short' || q.type === 'essay';
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
      await onSave(
        {
          ...quiz,
          title: title.trim(),
          questions,
          updatedAt: Date.now(),
        },
        behavior
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!quiz) return null;

  return (
    <EditorWorkspace
      key={quiz.id}
      isOpen={isOpen}
      title={title.trim() || (originalTitle ? 'Edit Quiz' : 'New Quiz')}
      subtitle={
        <span>
          {questions.length} {questions.length === 1 ? 'question' : 'questions'}
        </span>
      }
      isDirty={isDirty}
      isSaving={saving}
      onSave={handleSave}
      onClose={onClose}
      saveLabel="Save Quiz"
      footerExtras={
        aiEnabled ? (
          <button
            onClick={() => setShowAiPrompt(true)}
            className="h-[36px] px-3 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-2 active:scale-95"
            title="Generate with AI"
          >
            <Sparkles className="w-4 h-4" />
            Draft with AI
          </button>
        ) : null
      }
      contextPane={
        <div className="flex flex-col h-full">
          {/* Questions / Settings segmented tab toggle */}
          <div className="px-4 pt-3 pb-0 border-b border-slate-200 bg-white shrink-0 flex gap-1">
            {(['questions', 'settings'] as const).map((tab) => (
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

          {editorTab === 'questions' ? (
            <QuizEditorContextPane
              state={editorState}
              aiEnabled={aiEnabled}
              folders={folders}
              folderId={folderId}
              onFolderChange={onFolderChange}
            />
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 px-5 py-5 space-y-5">
              <QuizBehaviorSettingsPanel
                value={behavior}
                onChange={setBehavior}
              />
            </div>
          )}
        </div>
      }
      detailPane={
        editorTab === 'questions' ? (
          <QuizEditorDetailPane state={editorState} aiEnabled={aiEnabled} />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm px-8 text-center">
            <p>
              Settings saved with the quiz. They become the default when you
              assign it.
            </p>
          </div>
        )
      }
      overlay={<QuizAiOverlay state={editorState} />}
    />
  );
};
