/**
 * usePlcFolders — PLC folder tree, shared by a PLC's members (PLC_ASSESSMENT_DATA §3.4/§7.3).
 *
 * Binds `useFolderTree` to `plcs/{plcId}/folders`, with `plcs/{plcId}/quizzes`
 * and `plcs/{plcId}/assessments` as the item collections so both the shared
 * quiz library and its pooled assessments re-home on folder delete.
 */

import { useCallback, useMemo } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFolderTree } from './useFolderTree';
import type { UseFoldersResult } from './useFolderTree';

export interface PlcFolderMoveTarget {
  plcQuizId: string | null;
  assessmentId: string | null;
}

export interface UsePlcFoldersResult extends UseFoldersResult {
  /** Moves the library entry and the assessment pooled on it in one batch. */
  moveEntry: (
    target: PlcFolderMoveTarget,
    folderId: string | null
  ) => Promise<void>;
}

export const usePlcFolders = (
  plcId: string | undefined
): UsePlcFoldersResult => {
  const config = useMemo(
    () => ({
      folderPath: plcId ? ['plcs', plcId, 'folders'] : null,
      itemPaths: plcId
        ? [
            ['plcs', plcId, 'quizzes'],
            ['plcs', plcId, 'assessments'],
          ]
        : [],
      logContext: { plcId },
    }),
    [plcId]
  );
  const base = useFolderTree(config);

  const moveEntry = useCallback(
    async (
      target: PlcFolderMoveTarget,
      folderId: string | null
    ): Promise<void> => {
      if (!plcId) throw new Error('Not authenticated');
      if (!target.plcQuizId && !target.assessmentId) {
        throw new Error('moveEntry requires plcQuizId or assessmentId');
      }
      const batch = writeBatch(db);
      const now = Date.now();
      if (target.plcQuizId) {
        batch.update(doc(db, 'plcs', plcId, 'quizzes', target.plcQuizId), {
          folderId,
          updatedAt: now,
        });
      }
      if (target.assessmentId) {
        batch.update(
          doc(db, 'plcs', plcId, 'assessments', target.assessmentId),
          {
            folderId,
            updatedAt: now,
          }
        );
      }
      await batch.commit();
    },
    [plcId]
  );

  return useMemo<UsePlcFoldersResult>(
    () => ({ ...base, moveEntry }),
    [base, moveEntry]
  );
};
