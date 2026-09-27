/**
 * useFlashcardResults — teacher-side view of one flashcard assignment
 * (docs/plans/shipped/FLASHCARDS.md §6 "Teacher results"). Subscribes to the session
 * doc and its `progress` subcollection while a results view is open.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { logError } from '@/utils/logError';
import type { FlashcardProgress, FlashcardSession } from '@/types';
import {
  FC_CONTENT_COLLECTION,
  FC_CONTENT_DOC,
  mergeFlashcardSessionContent,
  type FlashcardSessionContent,
} from '@/utils/flashcardSessionContent';
import {
  FLASHCARD_PROGRESS_SUBCOLLECTION,
  FLASHCARD_SESSIONS_COLLECTION,
} from './useFlashcardAssignments';

export interface FlashcardStudentResult extends FlashcardProgress {
  studentUid: string;
}

export interface UseFlashcardResultsResult {
  session: FlashcardSession | null;
  results: FlashcardStudentResult[];
  loading: boolean;
  error: string | null;
  /** Deletes one student's progress so they can start over. */
  resetStudent: (studentUid: string) => Promise<void>;
  /** Accepts or dismisses a student's "I think this is right" flag. */
  resolveFlag: (
    studentUid: string,
    cardId: string,
    accept: boolean
  ) => Promise<void>;
}

interface ResolveFlagInput {
  assignmentId: string;
  studentUid: string;
  cardId: string;
  accept: boolean;
}

const EMPTY: FlashcardStudentResult[] = [];

export const useFlashcardResults = (
  assignmentId: string | null | undefined
): UseFlashcardResultsResult => {
  const [rawSession, setSession] = useState<FlashcardSession | null>(null);
  const [results, setResults] = useState<FlashcardStudentResult[]>(EMPTY);
  const [sessionLoading, setLoading] = useState(Boolean(assignmentId));
  const [error, setError] = useState<string | null>(null);
  // undefined until the content listener has fired once or errored.
  const [content, setContent] = useState<
    FlashcardSessionContent | null | undefined
  >(undefined);

  // Reset during render when the selected assignment changes.
  const [prevId, setPrevId] = useState(assignmentId);
  if (prevId !== assignmentId) {
    setPrevId(assignmentId);
    setSession(null);
    setResults(EMPTY);
    setLoading(Boolean(assignmentId));
    setError(null);
    setContent(undefined);
  }

  // Per-period sessions keep their cards in content/cards.
  const inContent = rawSession?.cardsInContent === true;
  useEffect(() => {
    if (!assignmentId || !inContent) return undefined;
    return onSnapshot(
      doc(
        db,
        FLASHCARD_SESSIONS_COLLECTION,
        assignmentId,
        FC_CONTENT_COLLECTION,
        FC_CONTENT_DOC
      ),
      (snapshot) =>
        setContent(
          snapshot.exists()
            ? (snapshot.data() as FlashcardSessionContent)
            : null
        ),
      (snapshotError) => {
        logError('useFlashcardResults.content', snapshotError, {
          assignmentId,
        });
        setContent(null);
      }
    );
  }, [assignmentId, inContent]);
  const session = useMemo(
    () =>
      rawSession
        ? mergeFlashcardSessionContent(rawSession, content ?? null)
        : null,
    [rawSession, content]
  );
  const loading = sessionLoading || (inContent && content === undefined);

  useEffect(() => {
    if (!assignmentId) return undefined;
    const sessionRef = doc(db, FLASHCARD_SESSIONS_COLLECTION, assignmentId);
    const unsubscribeSession = onSnapshot(
      sessionRef,
      (snapshot) => {
        setSession(
          snapshot.exists()
            ? ({ ...snapshot.data(), id: snapshot.id } as FlashcardSession)
            : null
        );
        setLoading(false);
      },
      (snapshotError) => {
        logError('useFlashcardResults.session', snapshotError, {
          assignmentId,
        });
        setError('Assignment results could not be loaded.');
        setLoading(false);
      }
    );
    const unsubscribeProgress = onSnapshot(
      collection(db, sessionRef.path, FLASHCARD_PROGRESS_SUBCOLLECTION),
      (snapshot) => {
        setResults(
          snapshot.docs.map(
            (progressDoc) =>
              ({
                ...progressDoc.data(),
                studentUid: progressDoc.id,
              }) as FlashcardStudentResult
          )
        );
      },
      (snapshotError) => {
        logError('useFlashcardResults.progress', snapshotError, {
          assignmentId,
        });
        setError('Student progress could not be loaded.');
      }
    );
    return () => {
      unsubscribeSession();
      unsubscribeProgress();
    };
  }, [assignmentId]);

  const resetStudent = useCallback<UseFlashcardResultsResult['resetStudent']>(
    async (studentUid) => {
      if (!assignmentId) return;
      await deleteDoc(
        doc(
          db,
          FLASHCARD_SESSIONS_COLLECTION,
          assignmentId,
          FLASHCARD_PROGRESS_SUBCOLLECTION,
          studentUid
        )
      );
    },
    [assignmentId]
  );

  const resolveFlag = useCallback<UseFlashcardResultsResult['resolveFlag']>(
    async (studentUid, cardId, accept) => {
      if (!assignmentId) return;
      const callable = httpsCallable<ResolveFlagInput, unknown>(
        functions,
        'resolveFlashcardFlagV1'
      );
      await callable({ assignmentId, studentUid, cardId, accept });
    },
    [assignmentId]
  );

  return {
    session,
    results,
    loading,
    error,
    resetStudent,
    resolveFlag,
  };
};
