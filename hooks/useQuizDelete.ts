import type { QuizAssignment, QuizMetadata } from '@/types';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import type { UseQuizResult } from '@/hooks/useQuiz';
import type { UseQuizAssignmentsResult } from '@/hooks/useQuizAssignments';
import { deletePaperBatchesForQuiz } from '@/utils/paperBatchStore';
import { quizDeleteDetail } from '@/utils/quizDeleteDetail';
import { useLibraryDelete } from '@/components/common/library/useLibraryDelete';
import { LIBRARY_ITEM_NOUNS } from '@/components/common/library/useLibraryDeleteConfirm';

interface UseQuizDeleteArgs {
  quizzes: QuizMetadata[];
  user: { uid: string } | null | undefined;
  assignments: QuizAssignment[];
  assignmentsLoading: UseQuizAssignmentsResult['loading'];
  assignmentsError: UseQuizAssignmentsResult['error'];
  addToast: DashboardContextValue['addToast'];
  deleteQuiz: UseQuizResult['deleteQuiz'];
}

const plural = (n: number) => `${n} quiz${n === 1 ? '' : 'zes'}`;

/** Quiz's delete policy: live assignments block a delete because the monitor and results need the library record. */
export const useQuizDelete = ({
  quizzes,
  user,
  assignments,
  assignmentsLoading,
  assignmentsError,
  addToast,
  deleteQuiz,
}: UseQuizDeleteArgs) => {
  const quizDelete = useLibraryDelete<QuizMetadata>({
    noun: LIBRARY_ITEM_NOUNS.quiz,
    titleOf: (meta) => meta.title,
    addToast,
    isBlocked: (meta) =>
      assignments.some((a) => a.quizId === meta.id && a.status !== 'inactive'),
    blockedMessage: (n) =>
      `Skipped ${plural(n)} with active or paused assignments. Deactivate them first.`,
    blockedReason: (n) =>
      n === 1
        ? '1 quiz has a live assignment'
        : `${n} quizzes have live assignments`,
    detail: (metas) =>
      quizDeleteDetail(
        assignments,
        metas.map((m) => m.id)
      ),
    // The live-assignment check is only trustworthy once assignments have loaded.
    notReady: () =>
      assignmentsError
        ? "Couldn't check assignments. Try again in a moment."
        : assignmentsLoading
          ? 'Still loading assignments. Try again in a moment.'
          : null,
    remove: async (meta) => {
      await deleteQuiz(meta.id, meta.driveFileId);
      if (user?.uid) {
        // Best-effort: the quiz is already gone, so a failure leaves only an unreachable batch record.
        await deletePaperBatchesForQuiz(user.uid, meta.id).catch(
          (batchErr: unknown) => {
            console.warn('[QuizWidget] paper batch cleanup:', batchErr);
          }
        );
      }
    },
    onError: (err, meta) =>
      console.error('[QuizWidget] delete failed for', meta.id, err),
  });

  return {
    onDelete: quizDelete.deleteOne,
    onBulkDelete: quizDelete.deleteMany,
    folderDeleteActions: quizDelete.folderActions(quizzes),
  };
};
