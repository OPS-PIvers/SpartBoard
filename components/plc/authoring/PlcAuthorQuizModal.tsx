/**
 * PlcAuthorQuizModal — Stream B.
 *
 * Mounts QuizEditorModal so a teacher can author a brand-new quiz from scratch
 * entirely inside the PLC (no board navigation required). On save, calls
 * saveQuiz to persist to Drive + Firestore, then opens PlcAssignmentConfigModal
 * so the teacher can configure the assignment in-PLC.
 *
 * Flow: QuizEditorModal.onSave → saveQuiz → build AssignmentQuizRef → open config.
 */

import React, { useCallback, useState } from 'react';
import { QuizEditorModal } from '@/components/widgets/QuizWidget/components/QuizEditorModal';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import type { Plc, QuizBehaviorSettings, QuizData } from '@/types';
import type { AssignmentQuizRef } from '@/hooks/useQuizAssignments';
import { PlcAssignmentConfigModal } from '../assignments/PlcAssignmentConfigModal';

interface PlcAuthorQuizModalProps {
  plc: Plc;
  isOpen: boolean;
  onClose: () => void;
}

export const PlcAuthorQuizModal: React.FC<PlcAuthorQuizModalProps> = ({
  plc,
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const { saveQuiz } = useQuiz(user?.uid);

  // After authoring, hold the AssignmentQuizRef to pass to the config modal.
  const [quizRef, setQuizRef] = useState<AssignmentQuizRef | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  // Seed the new quiz once on mount via lazy initializer so Date.now() and
  // crypto.randomUUID() are not called on every render.
  const [newQuiz] = useState<QuizData>(() => ({
    id: crypto.randomUUID(),
    title: '',
    questions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));

  const handleSave = useCallback(
    async (quiz: QuizData, behavior: QuizBehaviorSettings) => {
      const metadata = await saveQuiz(quiz, undefined, behavior);
      const ref: AssignmentQuizRef = {
        id: metadata.id,
        title: metadata.title,
        driveFileId: metadata.driveFileId,
        questions: quiz.questions,
      };
      setQuizRef(ref);
      setConfigOpen(true);
    },
    [saveQuiz]
  );

  const handleConfigClose = useCallback(() => {
    setConfigOpen(false);
    setQuizRef(null);
    onClose();
  }, [onClose]);

  if (configOpen && quizRef) {
    return (
      <PlcAssignmentConfigModal
        plc={plc}
        kind="quiz"
        quizRef={quizRef}
        isOpen
        onClose={handleConfigClose}
      />
    );
  }

  return (
    <QuizEditorModal
      isOpen={isOpen}
      quiz={newQuiz}
      onClose={onClose}
      onSave={handleSave}
    />
  );
};
