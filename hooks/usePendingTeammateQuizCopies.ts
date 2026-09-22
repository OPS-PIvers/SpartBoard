/**
 * usePendingTeammateQuizCopies — once-per-session sweep that builds the library
 * copies a PLC teammate's delegated print run deferred
 * (docs/plans/PLC_DELEGATED_PAPER_PRINTING.md D20).
 *
 * When a teammate prints response sheets for a teacher who does not yet hold
 * the quiz, and SpartBoard cannot reach that teacher's Drive, the server writes
 * the batch with a reserved quiz id and a `pendingQuizCopy` marker instead of
 * failing. This sweep runs in that teacher's own session — where their Drive is
 * live — and materializes the copy, which is the only thing the print run was
 * ever waiting on. They open SpartBoard before they can scan the stack, so the
 * copy is always there by the time it matters.
 *
 * Bounded and idempotent: a batch already bound to a copy clears its marker
 * without writing anything, and a failed run leaves the marker for next session.
 */

import { useEffect, useRef } from 'react';
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import type { PaperBatch, QuizData, QuizMetadata } from '@/types';
import type { QuizDriveLike } from '@/utils/mockQuizDriveService';
import {
  callJoinPlcQuizSyncGroup,
  pullSyncedQuizContent,
} from '@/hooks/useSyncedQuizGroups';
import {
  clearPendingQuizCopy,
  listPendingQuizCopyBatches,
} from '@/utils/paperBatchStore';
import { buildQuizSearchText } from '@/utils/quizSearchText';
import { countQuestionsNeedingKey } from '@/utils/quizNeedsKey';
import { logError } from '@/utils/logError';

const SESSION_KEY_PREFIX = 'spartboard:pendingQuizCopies:';
const QUIZZES_COLLECTION = 'quizzes';

/** The `saveQuiz` half of the Drive service is all this sweep needs. */
export type QuizReplicaWriter = Pick<QuizDriveLike, 'saveQuiz'>;

/** What the teacher is told about a copy that landed while they were away. */
export interface PendingQuizCopyResult {
  title: string;
  requestedByName: string;
}

interface PendingCopiesArgs {
  uid: string | null | undefined;
  /** This session's live Drive token; absent means Drive is not connected. */
  googleAccessToken: string | null | undefined;
  /** Called once per copy this sweep added, so the teacher is not surprised. */
  onCopyAdded?: (result: PendingQuizCopyResult) => void;
}

/**
 * The quiz Drive service, imported only once a deferred copy actually exists —
 * it is a large module and this path is rare.
 */
async function loadQuizReplicaWriter(
  uid: string,
  googleAccessToken: string | null | undefined
): Promise<QuizReplicaWriter | null> {
  if (isAuthBypass) {
    const { MockQuizDriveService } =
      await import('@/utils/mockQuizDriveService');
    return new MockQuizDriveService(uid);
  }
  if (!googleAccessToken) return null;
  const { QuizDriveService } = await import('@/utils/quizDriveService');
  return new QuizDriveService(googleAccessToken);
}

export function usePendingTeammateQuizCopies({
  uid,
  googleAccessToken,
  onCopyAdded,
}: PendingCopiesArgs): void {
  const didRunRef = useRef(false);
  const onCopyAddedRef = useRef(onCopyAdded);
  useEffect(() => {
    onCopyAddedRef.current = onCopyAdded;
  }, [onCopyAdded]);

  useEffect(() => {
    if (!uid) return;
    if (!isAuthBypass && !googleAccessToken) return;
    if (didRunRef.current) return;
    didRunRef.current = true;

    // Once per session per uid, and only marked done on success so a failed
    // sweep is retried rather than swallowed.
    const storageKey = `${SESSION_KEY_PREFIX}${uid}`;
    try {
      if (
        typeof window !== 'undefined' &&
        window.sessionStorage.getItem(storageKey)
      ) {
        return;
      }
    } catch {
      // sessionStorage unavailable — the per-mount ref still guards re-entry.
    }

    void (async () => {
      const batches = await listPendingQuizCopyBatches(uid);
      if (batches.length > 0) {
        const drive = await loadQuizReplicaWriter(uid, googleAccessToken);
        if (!drive) return;
        await reconcilePendingQuizCopies(uid, drive, batches, (result) =>
          onCopyAddedRef.current?.(result)
        );
      }
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(storageKey, '1');
        }
      } catch {
        // ignore — the per-mount ref already prevents duplicate runs.
      }
    })().catch((err) => {
      logError('usePendingTeammateQuizCopies.sweep', err, { uid });
    });
  }, [uid, googleAccessToken]);
}

export async function reconcilePendingQuizCopies(
  uid: string,
  quizDrive: QuizReplicaWriter,
  batches: readonly PaperBatch[],
  onCopyAdded?: (result: PendingQuizCopyResult) => void
): Promise<void> {
  for (const batch of batches) {
    const pending = batch.pendingQuizCopy;
    if (!pending) continue;
    try {
      // They may have added the quiz themselves in the meantime; the batch
      // binds to whichever copy their library actually holds.
      const existing = await getDocs(
        query(
          collection(db, 'users', uid, QUIZZES_COLLECTION),
          where('sync.groupId', '==', pending.groupId),
          limit(1)
        )
      );
      const found = existing.docs[0];
      if (found) {
        await clearPendingQuizCopy(uid, batch.id, found.id);
        continue;
      }

      // Join first: it is idempotent and leaves nothing local behind if it
      // fails, so a half-built copy can never outlive a failed membership write.
      const join = await callJoinPlcQuizSyncGroup(
        pending.plcId,
        pending.plcQuizId
      );
      const canonical = await pullSyncedQuizContent(pending.groupId);
      const now = Date.now();
      const quizData: QuizData = {
        id: batch.quizId,
        title: canonical.title,
        questions: canonical.questions,
        ...(canonical.stimuli?.length ? { stimuli: canonical.stimuli } : {}),
        ...(canonical.paperSheetStimuli?.length
          ? { paperSheetStimuli: canonical.paperSheetStimuli }
          : {}),
        ...(canonical.language ? { language: canonical.language } : {}),
        createdAt: pending.requestedAt,
        updatedAt: now,
      };
      const driveFileId = await quizDrive.saveQuiz(quizData);

      const metadata: QuizMetadata = {
        id: batch.quizId,
        title: canonical.title,
        driveFileId,
        questionCount: canonical.questions.length,
        searchText: buildQuizSearchText(canonical.questions),
        needsKeyCount: countQuestionsNeedingKey(canonical.questions),
        createdAt: pending.requestedAt,
        updatedAt: now,
        sync: {
          groupId: pending.groupId,
          lastSyncedVersion: Math.max(canonical.version, join.version),
        },
        ...(canonical.behavior ? { behavior: canonical.behavior } : {}),
        ...(canonical.language ? { language: canonical.language } : {}),
      };
      await setDoc(
        doc(db, 'users', uid, QUIZZES_COLLECTION, batch.quizId),
        metadata
      );
      await clearPendingQuizCopy(uid, batch.id, batch.quizId);
      onCopyAdded?.({
        title: canonical.title,
        requestedByName: pending.requestedByName,
      });
    } catch (err) {
      // One unreachable group must not strand the rest; the marker stays.
      logError('usePendingTeammateQuizCopies.copy', err, {
        uid,
        batchId: batch.id,
        groupId: pending.groupId,
      });
    }
  }
}
