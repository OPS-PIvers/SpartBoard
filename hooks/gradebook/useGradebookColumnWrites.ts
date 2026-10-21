import { useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import {
  DEFAULT_ATTEMPT_POLICY,
  GRADEBOOK_COLLECTIONS,
  isCompletionOnly,
  type AttemptPolicy,
  type GradebookColumnConfig,
  type GradebookKind,
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
  column: Pick<GradebookColumnRef, 'sessionId' | 'kind' | 'completionOnly'>,
  ownerUid: string
): GradebookColumnConfig {
  return {
    kind: column.kind,
    sessionId: column.sessionId,
    ownerUid,
    editorUids: [],
    category: null,
    countsTowardOverall: !(
      column.completionOnly ?? isCompletionOnly(column.kind)
    ),
    maxPointsOverride: null,
    attemptPolicy: DEFAULT_ATTEMPT_POLICY,
    targets: [],
    hiddenInRosterIds: [],
    updatedAt: 0,
  };
}

/** The column doc, or null when none exists; a missing doc fails the owner read rule, so only permission-denied reads as null. */
async function readColumn(
  sessionId: string
): Promise<GradebookColumnConfig | null> {
  try {
    const snap = await getDoc(
      doc(db, GRADEBOOK_COLLECTIONS.columns, sessionId)
    );
    return snap.exists() ? (snap.data() as GradebookColumnConfig) : null;
  } catch (err) {
    if ((err as { code?: unknown }).code === 'permission-denied') return null;
    throw err;
  }
}

/** Which attempt counts for a session, as the Gradebook column holds it; null when the read failed. */
export async function loadAttemptPolicy(
  sessionId: string
): Promise<AttemptPolicy | null> {
  try {
    return (
      (await readColumn(sessionId))?.attemptPolicy ?? DEFAULT_ATTEMPT_POLICY
    );
  } catch {
    return null;
  }
}

/** Saves the Final score choice from the Assign dialog onto the session's Gradebook column. */
export async function saveAttemptPolicy(
  uid: string,
  sessionId: string,
  kind: GradebookKind,
  attemptPolicy: AttemptPolicy
): Promise<void> {
  const base =
    (await readColumn(sessionId)) ??
    defaultColumnConfig({ sessionId, kind }, uid);
  await setDoc(doc(db, GRADEBOOK_COLLECTIONS.columns, sessionId), {
    ...base,
    attemptPolicy,
    updatedAt: Date.now(),
  });
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
