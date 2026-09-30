import { useEffect, useMemo, useRef } from 'react';
import type { FlashcardAssignment, FlashcardSession } from '@/types';
import { useAuth } from '@/context/useAuth';
import { writePlcFlashcardResult } from '@/hooks/usePlcFlashcards';
import type { FlashcardResultRecord } from '@/utils/flashcardResults';
import {
  buildPlcFlashcardResultSummary,
  flashcardAssignmentClassLabel,
  plcFlashcardSummaryKey,
} from '@/utils/plcFlashcardResults';
import { logError } from '@/utils/logError';

const SYNC_DELAY_MS = 3000;

/** Keeps a PLC-shared results summary current while the teacher has results open. */
export const useSyncPlcFlashcardResult = (
  assignment: FlashcardAssignment,
  session: FlashcardSession | null,
  results: readonly FlashcardResultRecord[],
  ready: boolean
): void => {
  const { user } = useAuth();
  const plcShare = assignment.plcShare ?? null;
  const summary = useMemo(
    () =>
      plcShare && session && ready
        ? buildPlcFlashcardResultSummary(session, results)
        : null,
    [plcShare, ready, results, session]
  );
  const key = summary ? plcFlashcardSummaryKey(summary) : null;
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!plcShare || !summary || !user || key === lastKey.current) {
      return undefined;
    }
    const timer = setTimeout(() => {
      writePlcFlashcardResult(plcShare.plcId, user.uid, {
        assignmentId: assignment.id,
        setId: assignment.setId,
        setTitle: assignment.setTitle,
        classLabel: flashcardAssignmentClassLabel(assignment),
        summary,
        sharedAt: plcShare.sharedAt,
        sharedByName: user.displayName ?? '',
        sharedByEmail: user.email ? user.email.toLowerCase() : '',
      })
        .then(() => {
          lastKey.current = key;
        })
        .catch((err: unknown) =>
          logError('useSyncPlcFlashcardResult', err, {
            assignmentId: assignment.id,
          })
        );
    }, SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [assignment, key, plcShare, summary, user]);
};
