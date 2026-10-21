import { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizResponse } from '@/types';
import { logError } from '@/utils/logError';

/** A server-saved copy of one finished attempt (docs/plans/QUIZ_ATTEMPT_HISTORY.md D1). */
export type QuizAttemptCopy = Partial<QuizResponse> & {
  n: number;
  closed?: boolean;
};

/** An earlier attempt read as a finished response; its own grades replace the live ones. */
export function attemptAsResponse(
  live: QuizResponse,
  copy: QuizAttemptCopy
): QuizResponse {
  return {
    ...live,
    status: 'completed',
    answers: copy.answers ?? [],
    grading: copy.grading,
    score: copy.score ?? null,
    submittedAt: copy.submittedAt ?? null,
    servedQuestionIds: copy.servedQuestionIds,
  };
}

export type QuizAttemptSource = (
  sessionId: string,
  responseKey: string
) => QuizAttemptCopy[] | null;

/** Lets a dev harness supply attempt copies without Firestore. */
export const QuizAttemptSourceContext = createContext<QuizAttemptSource | null>(
  null
);

/** Saved attempt copies for one response, oldest first; null while loading or when off. */
export function useQuizResponseAttempts(
  sessionId: string | null | undefined,
  responseKey: string | null | undefined,
  enabled: boolean
): QuizAttemptCopy[] | null {
  const override = useContext(QuizAttemptSourceContext);
  const key =
    enabled && !override && sessionId && responseKey
      ? `${sessionId}/${responseKey}`
      : null;
  const [state, setState] = useState<{
    key: string;
    copies: QuizAttemptCopy[];
  } | null>(null);

  useEffect(() => {
    if (!key || !sessionId || !responseKey) return;
    return onSnapshot(
      collection(
        db,
        'quiz_sessions',
        sessionId,
        'responses',
        responseKey,
        'attempts'
      ),
      (snap) =>
        setState({
          key,
          copies: snap.docs
            .map((d) => d.data() as QuizAttemptCopy)
            .filter((c) => typeof c.n === 'number')
            .sort((a, b) => a.n - b.n),
        }),
      (err) =>
        logError('useQuizResponseAttempts', err, { sessionId, responseKey })
    );
  }, [key, sessionId, responseKey]);

  if (!enabled || !sessionId || !responseKey) return null;
  if (override) return override(sessionId, responseKey);
  return state?.key === key ? state.copies : null;
}
