import { useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { QuizResponse, QuizSession } from '@/types';

/** Asks the server to score a submitted attempt when the quiz shows scores on submit. */
export function useQuizScoreOnSubmit(
  session: Pick<QuizSession, 'id' | 'showScoreOnSubmit'> | null | undefined,
  response:
    | Pick<QuizResponse, 'status' | 'score' | 'completedAttempts'>
    | null
    | undefined
): void {
  const sessionId = session?.id;
  const requestKey =
    sessionId &&
    session?.showScoreOnSubmit === true &&
    response?.status === 'completed' &&
    typeof response.score !== 'number'
      ? `${sessionId}:${response.completedAttempts ?? 0}`
      : null;
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (!requestKey || !sessionId || requested.current === requestKey) return;
    requested.current = requestKey;
    const score = httpsCallable<
      { sessionId: string },
      { score: number | null }
    >(functions, 'scoreQuizOnSubmitV1');
    // The response listener picks up the score; a failure leaves the wait screen.
    score({ sessionId }).catch((err: unknown) => {
      console.warn('[useQuizScoreOnSubmit] scoring failed:', err);
    });
  }, [requestKey, sessionId]);
}
