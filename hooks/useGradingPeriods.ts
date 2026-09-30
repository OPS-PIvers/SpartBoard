import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import { GRADEBOOK_COLLECTIONS } from '@/utils/gradebook/gradebookCore';
import {
  parsePeriodSet,
  periodSetForBuildings,
  sortPeriods,
  type GradingPeriodSet,
} from '@/utils/gradebook/gradingPeriods';

/** Every grading period set in the signed-in user's org (D18). */
export function useGradingPeriodSets(enabled = true): {
  sets: GradingPeriodSet[];
  loading: boolean;
} {
  const { orgId, user } = useAuth();
  const live = enabled && !isAuthBypass && !!user && !!orgId;
  const [state, setState] = useState<{
    orgId: string | null;
    sets: GradingPeriodSet[];
  }>({ orgId: null, sets: [] });

  useEffect(() => {
    if (!live || !orgId) return;
    return onSnapshot(
      query(
        collection(db, GRADEBOOK_COLLECTIONS.periodSets),
        where('orgId', '==', orgId)
      ),
      (snap) =>
        setState({
          orgId,
          sets: snap.docs
            .map((d) => parsePeriodSet(d.id, d.data()))
            .sort((a, b) => a.name.localeCompare(b.name)),
        }),
      (err) => {
        logError('useGradingPeriodSets', err);
        setState({ orgId, sets: [] });
      }
    );
  }, [live, orgId]);

  const current = live && state.orgId === orgId;
  return { sets: current ? state.sets : [], loading: live && !current };
}

/** The teacher's building periods, oldest first; empty when no set targets their building. */
export function useGradingPeriods(enabled = true) {
  const { selectedBuildings } = useAuth();
  const { sets, loading } = useGradingPeriodSets(enabled);
  const set = useMemo(
    () => periodSetForBuildings(sets, selectedBuildings),
    [sets, selectedBuildings]
  );
  const periods = useMemo(() => sortPeriods(set?.periods ?? []), [set]);
  return { set, periods, loading };
}
