// A colleague's quiz open on a shared board: read-only, and Assign copies it into the viewer's library.

import React from 'react';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import { SharedBoardItemPanel } from '@/components/sharedBoard/SharedBoardItemGate';
import {
  hasSharedBoardCopy,
  sharedBoardCopyId,
  type SharedBoardItemDoc,
  type SharedBoardQuizPayload,
} from '@/utils/sharedBoardItems';
import { QuizPreview } from './components/QuizPreview';

export const SharedBoardQuizView: React.FC<{
  item: SharedBoardItemDoc<SharedBoardQuizPayload>;
  onCopied: (copyId: string) => void;
}> = ({ item, onCopied }) => {
  const { user } = useAuth();
  const { saveQuiz } = useQuiz(user?.uid);
  const quiz = item.payload.quiz;

  const copy = async (): Promise<string> => {
    if (!user) throw new Error('Sign in to copy this quiz.');
    const copyId = sharedBoardCopyId(item.itemId);
    if (await hasSharedBoardCopy(user.uid, 'quiz', copyId)) return copyId;
    const now = Date.now();
    await saveQuiz({ ...quiz, id: copyId, createdAt: now, updatedAt: now });
    return copyId;
  };

  return (
    <SharedBoardItemPanel
      label="quiz"
      disabledReason={
        item.payload.hasBankSlots
          ? "View only. This quiz draws from a colleague's question banks, so it can't be copied."
          : undefined
      }
      onCopy={copy}
      onCopied={onCopied}
    >
      <QuizPreview quiz={quiz} />
    </SharedBoardItemPanel>
  );
};
