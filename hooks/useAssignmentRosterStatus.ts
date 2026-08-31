/**
 * useAssignmentRosterStatus — subscribes to the response/submission
 * subcollection for one assignment's session doc and derives a per-student
 * status map for the Assignments hub detail pane (M17 spec §5 D2).
 *
 * Doc-id keying matches the `useAssignmentPseudonyms.ts` contract: quiz,
 * video-activity, and guided-learning responses are keyed by `studentUid`;
 * mini-app submissions are keyed by the per-assignment pseudonym. Callers
 * resolve display names separately via `useAssignmentPseudonymsMulti`.
 *
 * Only the collection for the given `kind` is subscribed, and the listener
 * is torn down on unmount or when `kind`/`sessionId` change — satisfies the
 * "listeners only while the pane is open for the selected assignment"
 * requirement.
 */

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { AssignmentKind } from '@/components/assignmentsHub/useUnifiedAssignments';
import type { AssignmentStudentStatus } from '@/components/assignmentsHub/AssignmentStatusChip';
import type { QuizResponse } from '@/types';
import {
  deriveQuizStudentStatus,
  deriveCompletedAtStudentStatus,
  deriveSubmissionStudentStatus,
} from '@/utils/assignmentStudentStatus';

const SESSIONS_COLLECTION_BY_KIND: Record<AssignmentKind, string> = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
  'guided-learning': 'guided_learning_sessions',
  'mini-app': 'mini_app_sessions',
};

const SUBCOLLECTION_BY_KIND: Record<AssignmentKind, string> = {
  quiz: 'responses',
  'video-activity': 'responses',
  'guided-learning': 'responses',
  'mini-app': 'submissions',
};

export interface AssignmentRosterStatusResult {
  statusByUid: Map<string, AssignmentStudentStatus>;
  /** Quiz only — total question count, used by the "modified (N of M Qs)" marker. Null for other kinds / not-yet-loaded. */
  totalQuestions: number | null;
  loading: boolean;
}

const EMPTY_RESULT: AssignmentRosterStatusResult = {
  statusByUid: new Map(),
  totalQuestions: null,
  loading: false,
};

const LOADING_RESULT: AssignmentRosterStatusResult = {
  statusByUid: new Map(),
  totalQuestions: null,
  loading: true,
};

export function useAssignmentRosterStatus(
  kind: AssignmentKind | null | undefined,
  sessionId: string | null | undefined
): AssignmentRosterStatusResult {
  const selectionKey = `${kind ?? ''}::${sessionId ?? ''}`;
  const [result, setResult] = useState<AssignmentRosterStatusResult>(() =>
    kind && sessionId ? LOADING_RESULT : EMPTY_RESULT
  );
  // "Adjusting state while rendering" pattern (CLAUDE.md) — resets `result`
  // synchronously when the selected assignment changes, instead of an effect
  // calling `setState` on mount (which would cause a redundant extra render).
  const [prevSelectionKey, setPrevSelectionKey] = useState(selectionKey);
  if (prevSelectionKey !== selectionKey) {
    setPrevSelectionKey(selectionKey);
    setResult(kind && sessionId ? LOADING_RESULT : EMPTY_RESULT);
  }

  useEffect(() => {
    if (!kind || !sessionId) return;

    const sessionsCollection = SESSIONS_COLLECTION_BY_KIND[kind];
    const subcollection = SUBCOLLECTION_BY_KIND[kind];

    let latestDocsStatus = new Map<string, AssignmentStudentStatus>();
    let latestTotalQuestions: number | null = null;
    let docsLoaded = false;
    let sessionLoaded = kind !== 'quiz';

    const emit = () => {
      if (!docsLoaded) return;
      setResult({
        statusByUid: new Map(latestDocsStatus),
        totalQuestions: latestTotalQuestions,
        loading: !sessionLoaded,
      });
    };

    const unsubDocs = onSnapshot(
      collection(db, sessionsCollection, sessionId, subcollection),
      (snap) => {
        const next = new Map<string, AssignmentStudentStatus>();
        snap.forEach((d) => {
          const data = d.data();
          if (kind === 'quiz') {
            next.set(
              d.id,
              deriveQuizStudentStatus(data as Partial<QuizResponse>)
            );
          } else if (kind === 'mini-app') {
            next.set(d.id, deriveSubmissionStudentStatus(true));
          } else {
            const completedAt =
              typeof data.completedAt === 'number' ? data.completedAt : null;
            next.set(d.id, deriveCompletedAtStudentStatus(completedAt, true));
          }
        });
        latestDocsStatus = next;
        docsLoaded = true;
        emit();
      },
      () => {
        docsLoaded = true;
        emit();
      }
    );

    // Quiz only: fetch the session doc's `totalQuestions` for the
    // "modified (N of M Qs)" marker. Other kinds have no reduced-question-set
    // override field, so this stays null for them.
    const unsubSession =
      kind === 'quiz'
        ? onSnapshot(
            doc(db, sessionsCollection, sessionId),
            (snap) => {
              const data = snap.data();
              latestTotalQuestions =
                typeof data?.totalQuestions === 'number'
                  ? data.totalQuestions
                  : null;
              sessionLoaded = true;
              emit();
            },
            () => {
              sessionLoaded = true;
              emit();
            }
          )
        : null;

    return () => {
      unsubDocs();
      unsubSession?.();
    };
  }, [kind, sessionId]);

  return result;
}
