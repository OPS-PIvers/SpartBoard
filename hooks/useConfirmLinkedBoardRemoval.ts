// Confirm before a delete or move takes boards out of a shared collection for everyone (COLLECTION_SHARING D4).

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import type { BoardDestination } from '@/hooks/useLinkedCollectionSync';

/** Resolves true when nothing is removed for everyone, or the teacher confirms it. */
export const useConfirmLinkedBoardRemoval = () => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const { countLinkedBoardRemovals } = useDashboard();
  return useCallback(
    async (
      boardIds: string[],
      destination: BoardDestination
    ): Promise<boolean> => {
      if (countLinkedBoardRemovals(boardIds, destination) === 0) return true;
      const label = t('boardsModal.removeSharedBoardConfirmLabel', {
        defaultValue: 'Remove',
      });
      return showConfirm(
        t('boardsModal.removeSharedBoardConfirm', {
          defaultValue:
            'Remove this board for everyone in the shared collection?',
        }),
        { title: label, variant: 'danger', confirmLabel: label }
      );
    },
    [t, showConfirm, countLinkedBoardRemovals]
  );
};

/** Resolves true when moving the collection removes no boards for everyone, or the teacher confirms it. */
export const useConfirmLinkedCollectionMove = () => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const { countLinkedCollectionMoveRemovals } = useDashboard();
  return useCallback(
    async (
      collectionId: string,
      destination: string | null
    ): Promise<boolean> => {
      if (countLinkedCollectionMoveRemovals(collectionId, destination) === 0) {
        return true;
      }
      const label = t('boardsModal.removeSharedBoardConfirmLabel', {
        defaultValue: 'Remove',
      });
      return showConfirm(
        t('boardsModal.removeSharedCollectionConfirm', {
          defaultValue:
            'Remove this collection and its boards for everyone in the shared collection?',
        }),
        { title: label, variant: 'danger', confirmLabel: label }
      );
    },
    [t, showConfirm, countLinkedCollectionMoveRemovals]
  );
};
