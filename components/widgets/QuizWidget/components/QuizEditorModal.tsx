/**
 * QuizEditorModal — full-screen modal editor for a quiz.
 *
 * Wraps the two-pane EditorWorkspace: left context pane has the title +
 * folder picker + sortable questions list; right detail pane has the editor
 * for the currently-selected question (type / time / points / answer).
 */

import React, { useEffect, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { LibraryFolder, QuizData, QuizQuestion } from '@/types';
import { EditorWorkspace } from '@/components/common/EditorWorkspace';
import { useAuth } from '@/context/useAuth';
import {
  QuizAiOverlay,
  QuizEditorContextPane,
  QuizEditorDetailPane,
} from './QuizEditor';
import { useQuizEditorState } from './useQuizEditorState';

interface QuizEditorModalProps {
  isOpen: boolean;
  quiz: QuizData | null;
  onClose: () => void;
  onSave: (updatedQuiz: QuizData) => Promise<void>;
  /** Folders for the FolderSelectField. Omit to hide the field. */
  folders?: LibraryFolder[];
  /** Current folder id for this quiz (null = root). */
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
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

  const isDirty = useMemo(
    () =>
      title !== originalTitle || !questionsEqual(questions, originalQuestions),
    [title, originalTitle, questions, originalQuestions]
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
      await onSave({
        ...quiz,
        title: title.trim(),
        questions,
        updatedAt: Date.now(),
      });
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
        <QuizEditorContextPane
          state={editorState}
          aiEnabled={aiEnabled}
          folders={folders}
          folderId={folderId}
          onFolderChange={onFolderChange}
        />
      }
      detailPane={
        <QuizEditorDetailPane state={editorState} aiEnabled={aiEnabled} />
      }
      overlay={<QuizAiOverlay state={editorState} />}
    />
  );
};
