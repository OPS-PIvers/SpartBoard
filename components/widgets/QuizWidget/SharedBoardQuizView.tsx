// A colleague's quiz open on a shared board: read-only, and Assign copies it into the viewer's library.

import React from 'react';
import { Hourglass, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboardCanvasSelector } from '@/context/dashboardCanvasStore';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
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

/** A colleague's quiz whose board copy is still loading or isn't there yet. */
export const SharedBoardQuizUnavailable: React.FC<{
  loading: boolean;
  title: string | null | undefined;
  ownerUid: string | null | undefined;
}> = ({ loading, title, ownerUid }) => {
  const ownerName = useDashboardCanvasSelector((s) =>
    ownerUid && s.activeDashboard?.linkedShareHostUid === ownerUid
      ? (s.activeDashboard.linkedShareHostName ?? null)
      : null
  );
  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-slate-400"
        style={{ gap: 'min(12px, 3cqmin)' }}
      >
        <Loader2
          className="animate-spin"
          style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
        />
        <span style={{ fontSize: 'min(13px, 4.5cqmin)' }}>Loading quiz…</span>
      </div>
    );
  }
  return (
    <ScaledEmptyState
      icon={Hourglass}
      title={`${title ? `"${title}"` : 'This quiz'} isn't available on this board yet`}
      subtitle={`It shows up here after ${ownerName ?? 'the teacher who owns it'} next opens this board.`}
      iconClassName="text-brand-blue-primary"
      titleClassName="text-brand-blue-primary"
      subtitleClassName="text-slate-600"
    />
  );
};
