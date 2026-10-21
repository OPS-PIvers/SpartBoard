import { createContext, useContext, useEffect, useState } from 'react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
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

/** Every finished attempt of each response, oldest first, the latest being the live doc; for exports and print. */
export async function loadEveryAttempt(
  sessionId: string,
  responses: readonly QuizResponse[],
  keyOf: (response: QuizResponse) => string,
  /** A dev harness's copies, used instead of Firestore. */
  source?: QuizAttemptSource | null
): Promise<Map<string, QuizResponse[]>> {
  const out = new Map<string, QuizResponse[]>();
  await Promise.all(
    responses.map(async (live) => {
      const key = keyOf(live);
      const done =
        live.completedAttempts ?? (live.status === 'completed' ? 1 : 0);
      const latest = {
        ...live,
        completedAttempts:
          live.status === 'completed' ? Math.max(done, 1) : done + 1,
      };
      if ((live.completedAttempts ?? 0) < 2) {
        out.set(key, [latest]);
        return;
      }
      const copies = source
        ? (source(sessionId, key) ?? [])
        : (
            await getDocs(
              collection(
                db,
                'quiz_sessions',
                sessionId,
                'responses',
                key,
                'attempts'
              )
            )
          ).docs.map((d) => d.data() as QuizAttemptCopy);
      const earlier = copies
        .filter((c) => c.closed === true && typeof c.n === 'number')
        .sort((a, b) => a.n - b.n)
        .map((c) => ({
          ...attemptAsResponse(live, c),
          completedAttempts: c.n,
        }));
      out.set(key, [...earlier, latest]);
    })
  );
  return out;
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

/** One earlier attempt as `getMyQuizAttemptsV1` returns it to its student. */
export interface MyQuizAttempt {
  n: number;
  submittedAt: number | null;
  score: number | null;
  answers?: { questionId: string; answer: string; isCorrect?: boolean }[];
  grading?: QuizResponse['grading'];
  servedQuestionIds?: string[];
}

export type MyQuizAttemptsLoader = (req: {
  sessionId: string;
  responseKey: string;
}) => Promise<{ attempts: MyQuizAttempt[] }>;

const callMyQuizAttempts: MyQuizAttemptsLoader = async (req) =>
  (
    await httpsCallable<typeof req, { attempts: MyQuizAttempt[] }>(
      functions,
      'getMyQuizAttemptsV1'
    )(req)
  ).data;

/** Lets a dev harness or test supply a student's earlier attempts. */
export const MyQuizAttemptsLoaderContext =
  createContext<MyQuizAttemptsLoader>(callMyQuizAttempts);

/** A student's own earlier attempts as their results settings allow; [] when none or off. */
export function useMyQuizAttempts(
  sessionId: string,
  responseKey: string | undefined,
  /** Changes whenever the server's answer could (new attempt, results setting). */
  refreshKey: string | null
): MyQuizAttempt[] {
  const load = useContext(MyQuizAttemptsLoaderContext);
  const key =
    responseKey && refreshKey
      ? `${sessionId}/${responseKey}/${refreshKey}`
      : null;
  const [state, setState] = useState<{
    key: string;
    attempts: MyQuizAttempt[];
  } | null>(null);

  useEffect(() => {
    if (!key || !responseKey) return;
    let live = true;
    load({ sessionId, responseKey })
      .then((res) => {
        if (live)
          setState({
            key,
            attempts: Array.isArray(res?.attempts) ? res.attempts : [],
          });
      })
      .catch((err: unknown) => {
        logError('useMyQuizAttempts', err, { sessionId, responseKey });
      });
    return () => {
      live = false;
    };
  }, [key, load, sessionId, responseKey]);

  return state && state.key === key ? state.attempts : [];
}

/** The student's live response with an earlier attempt's answers and grades in place. */
export function myAttemptAsResponse<R extends QuizResponse>(
  live: R,
  attempt: MyQuizAttempt
): R {
  return {
    ...live,
    status: 'completed',
    answers: (attempt.answers ?? []).map((a) => ({ ...a, answeredAt: 0 })),
    grading: attempt.grading,
    score: attempt.score,
    submittedAt: attempt.submittedAt,
    servedQuestionIds: attempt.servedQuestionIds,
    artifactArchive: undefined,
  };
}
