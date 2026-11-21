import { useCallback } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { isTourSandboxActive } from '@/utils/tourSandbox';
import type { DashboardContextValue } from '@/context/DashboardContextValue';

const QUIZZES_COLLECTION = 'quizzes';

// Persist a new ordering of quizzes. We write `order` onto each metadata
// doc in a single batch — the Drive blob is untouched.
export const useQuizReorder = (
  user: { uid: string } | null | undefined,
  addToast: DashboardContextValue['addToast']
) =>
  useCallback(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- deps narrowed to user?.uid on purpose
    async (orderedIds: string[]) => {
      if (!user?.uid || isTourSandboxActive()) return;
      const batch = writeBatch(db);
      orderedIds.forEach((id, index) => {
        batch.update(doc(db, 'users', user.uid, QUIZZES_COLLECTION, id), {
          order: index,
        });
      });
      try {
        await batch.commit();
      } catch (err) {
        console.error('[QuizWidget] Failed to persist reorder:', err);
        // A concurrently-deleted quiz makes batch.update() throw NOT_FOUND.
        // useSortableReorder catches the re-throw and reverts the visual order;
        // surface a toast so the teacher knows why their drag snapped back.
        addToast('Could not save the new order. Please try again.', 'error');
        throw err;
      }
    },
    [user?.uid, addToast]
  );
