import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { ScoredWork, ScoredWorkScore } from '@/types';
import { subscribeScoredWork, subscribeScores } from '@/utils/scoredWorkStore';

interface Subscribed<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/** The teacher's scored-work sets, newest first. */
export function useScoredWorkList(
  userId: string | undefined
): Subscribed<ScoredWork[]> {
  const [state, setState] = useState<Subscribed<ScoredWork[]>>({
    data: [],
    loading: !!userId,
    error: null,
  });
  useEffect(() => {
    if (!userId) return;
    return subscribeScoredWork(
      userId,
      (data) => setState({ data, loading: false, error: null }),
      (error) => setState({ data: [], loading: false, error })
    );
  }, [userId]);
  return userId ? state : { data: [], loading: false, error: null };
}

/** Every saved score of one set. */
export function useScoredWorkScores(
  userId: string | undefined,
  workId: string | undefined
): Subscribed<ScoredWorkScore[]> {
  const [state, setState] = useState<Subscribed<ScoredWorkScore[]>>({
    data: [],
    loading: !!userId && !!workId,
    error: null,
  });
  useEffect(() => {
    if (!userId || !workId) return;
    return subscribeScores(
      userId,
      workId,
      (data) => setState({ data, loading: false, error: null }),
      (error) => setState({ data: [], loading: false, error })
    );
  }, [userId, workId]);
  return userId && workId ? state : { data: [], loading: false, error: null };
}

export const publishScoredWorkToPlc = (input: {
  workId: string;
  plcId: string;
  seriesLabel: string;
}) =>
  httpsCallable<typeof input, { seriesKey: string; studentCount: number }>(
    functions,
    'publishScoredWorkToPlcV1'
  )(input);

export const withdrawScoredWorkFromPlc = (workId: string) =>
  httpsCallable<{ workId: string }, { ok: true }>(
    functions,
    'withdrawScoredWorkFromPlcV1'
  )({ workId });
