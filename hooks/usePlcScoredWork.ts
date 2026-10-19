import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { PlcScoredWorkAggregate } from '@/types';

/** Live pooled scored-work results for one PLC, newest first. */
export function usePlcScoredWork(plcId: string | null): {
  aggregates: PlcScoredWorkAggregate[];
  loading: boolean;
  error: Error | null;
} {
  const [state, setState] = useState<{
    aggregates: PlcScoredWorkAggregate[];
    loading: boolean;
    error: Error | null;
  }>({ aggregates: [], loading: !!plcId, error: null });

  useEffect(() => {
    if (!plcId) return;
    return onSnapshot(
      collection(db, 'plcs', plcId, 'scored_work_aggregates'),
      (snap) =>
        setState({
          aggregates: snap.docs
            .map((d) => d.data() as PlcScoredWorkAggregate)
            .sort((a, b) => b.lastPublishedAt - a.lastPublishedAt),
          loading: false,
          error: null,
        }),
      (error) => setState({ aggregates: [], loading: false, error })
    );
  }, [plcId]);

  return plcId ? state : { aggregates: [], loading: false, error: null };
}
