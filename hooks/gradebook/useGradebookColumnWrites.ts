import { useCallback } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import {
  DEFAULT_ATTEMPT_POLICY,
  GRADEBOOK_COLLECTIONS,
  isCompletionOnly,
  type GradebookColumnConfig,
} from '@/utils/gradebook/gradebookCore';
import type { GradebookColumnRef } from '@/components/gradebook/popovers/types';

export type ColumnPatch = Partial<
  Pick<
    GradebookColumnConfig,
    | 'category'
    | 'countsTowardOverall'
    | 'maxPointsOverride'
    | 'attemptPolicy'
    | 'targets'
    | 'hiddenInRosterIds'
  >
>;

export function defaultColumnConfig(
  column: Pick<GradebookColumnRef, 'sessionId' | 'kind'>,
  ownerUid: string
): GradebookColumnConfig {
  return {
    kind: column.kind,
    sessionId: column.sessionId,
    ownerUid,
    editorUids: [],
    category: null,
    countsTowardOverall: !isCompletionOnly(column.kind),
    maxPointsOverride: null,
    attemptPolicy: DEFAULT_ATTEMPT_POLICY,
    targets: [],
    hiddenInRosterIds: [],
    updatedAt: 0,
  };
}

export function useGradebookColumnWrites() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const saveColumn = useCallback(
    async (column: GradebookColumnRef, patch: ColumnPatch): Promise<void> => {
      if (!uid) throw new Error('Not authenticated');
      const base = column.config ?? defaultColumnConfig(column, uid);
      await setDoc(doc(db, GRADEBOOK_COLLECTIONS.columns, column.sessionId), {
        ...base,
        ...patch,
        updatedAt: Date.now(),
      });
    },
    [uid]
  );

  const setHidden = useCallback(
    (column: GradebookColumnRef, rosterId: string, hidden: boolean) => {
      const current = column.config?.hiddenInRosterIds ?? [];
      const next = hidden
        ? Array.from(new Set([...current, rosterId]))
        : current.filter((id) => id !== rosterId);
      return saveColumn(column, { hiddenInRosterIds: next });
    },
    [saveColumn]
  );

  return { saveColumn, setHidden };
}
