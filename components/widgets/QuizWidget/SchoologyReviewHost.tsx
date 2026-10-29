// Opens the Schoology review the extension asks for (docs/plans/SCHOOLOGY_QUIZ_IMPORT.md Q8), adding a Quiz widget when the board has none.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useIsActiveBoardReadOnly } from '@/context/dashboardCanvasStore';
import { SCHOOLOGY_REVIEW_EVENT } from '@/utils/schoologyReviewProtocol';
import {
  requestSchoologyReview,
  schoologyReviewPending,
  subscribeSchoologyReview,
} from '@/utils/schoologyInbox';

export const SchoologyReviewHost: React.FC = () => {
  const pending = useSyncExternalStore(
    subscribeSchoologyReview,
    schoologyReviewPending
  );
  const { activeDashboard, addWidget } = useDashboard();
  const readOnly = useIsActiveBoardReadOnly();
  const boardId = activeDashboard?.id ?? null;
  const hasQuiz = !!activeDashboard?.widgets.some((w) => w.type === 'quiz');
  const addedTo = useRef<string | null>(null);

  // The extension fires this in a SpartBoard tab that is already open, instead of reloading it.
  useEffect(() => {
    const onRequest = () => requestSchoologyReview();
    window.addEventListener(SCHOOLOGY_REVIEW_EVENT, onRequest);
    return () => window.removeEventListener(SCHOOLOGY_REVIEW_EVENT, onRequest);
  }, []);

  useEffect(() => {
    if (!pending) {
      addedTo.current = null;
      return;
    }
    if (!boardId || readOnly || hasQuiz || addedTo.current === boardId) return;
    // The new widget takes the waiting request when it mounts.
    addedTo.current = boardId;
    addWidget('quiz');
  }, [pending, boardId, readOnly, hasQuiz, addWidget]);

  return null;
};
