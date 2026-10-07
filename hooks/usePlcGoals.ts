// Live goals for one group (My Groups) plus the member write path.

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { PlcGoal, PlcGoalPractice } from '@/types';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';

export const PLC_GOAL_MAX_PRACTICES = 20;

function parsePractice(raw: unknown): PlcGoalPractice | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== 'string') return null;
  const routineId =
    typeof rec.routineId === 'string' && rec.routineId ? rec.routineId : null;
  const text = typeof rec.text === 'string' ? rec.text : '';
  if (!routineId && !text.trim()) return null;
  return routineId ? { id: rec.id, routineId, text } : { id: rec.id, text };
}

export const PLC_GOAL_PROGRESS_KEYS = [
  'baseline',
  'current',
  'target',
] as const;
export type PlcGoalProgress = Partial<
  Record<(typeof PLC_GOAL_PROGRESS_KEYS)[number], number>
>;

/** A whole percent, 0 to 100. */
export const isGoalPercent = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100;

export function parsePlcGoal(
  id: string,
  data: Record<string, unknown>
): PlcGoal | null {
  if (typeof data.title !== 'string' || typeof data.createdBy !== 'string') {
    return null;
  }
  const practices = Array.isArray(data.practices)
    ? data.practices
        .map(parsePractice)
        .filter((p): p is PlcGoalPractice => p !== null)
    : [];
  const goal: PlcGoal = {
    id,
    title: data.title,
    practices,
    order: typeof data.order === 'number' ? data.order : 0,
    createdBy: data.createdBy,
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
  if (typeof data.measure === 'string' && data.measure.trim()) {
    goal.measure = data.measure;
  }
  for (const key of PLC_GOAL_PROGRESS_KEYS) {
    const v = data[key];
    if (isGoalPercent(v)) goal[key] = v;
  }
  return goal;
}

/** Order, then oldest first, so new goals land at the bottom. */
export function sortPlcGoals(goals: PlcGoal[]): PlcGoal[] {
  return [...goals].sort(
    (a, b) => a.order - b.order || a.createdAt - b.createdAt
  );
}

export interface PlcGoalDraft {
  id?: string;
  title: string;
  measure?: string;
  /** Absent leaves stored numbers alone; present replaces them, missing keys cleared. */
  progress?: PlcGoalProgress;
  practices: PlcGoalPractice[];
  order: number;
}

export function usePlcGoals(plcId: string | null) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<{
    key: string | null;
    goals: PlcGoal[];
    loaded: boolean;
    error: Error | null;
  }>({ key: null, goals: [], loaded: false, error: null });

  useEffect(() => {
    if (!plcId || !uid || isAuthBypass) return;
    return onSnapshot(
      collection(db, 'plcs', plcId, 'goals'),
      (snap) => {
        const goals: PlcGoal[] = [];
        snap.forEach((d) => {
          const parsed = parsePlcGoal(d.id, d.data());
          if (parsed) goals.push(parsed);
        });
        setState({
          key: plcId,
          goals: sortPlcGoals(goals),
          loaded: true,
          error: null,
        });
      },
      (err) => {
        logError('usePlcGoals', err, { plcId });
        setState({ key: plcId, goals: [], loaded: true, error: err });
      }
    );
  }, [plcId, uid]);

  const current = state.key === plcId;

  const saveGoal = useCallback(
    async (draft: PlcGoalDraft): Promise<string> => {
      if (!plcId || !uid) throw new Error('Not signed in');
      const practices = draft.practices
        .slice(0, PLC_GOAL_MAX_PRACTICES)
        .map((p) =>
          p.routineId
            ? { id: p.id, routineId: p.routineId, text: p.text.trim() }
            : { id: p.id, text: p.text.trim() }
        )
        .filter((p) => 'routineId' in p || p.text);
      const measure = draft.measure?.trim() ?? '';
      const progress = draft.progress;
      const numbers: Record<string, number> = {};
      for (const key of PLC_GOAL_PROGRESS_KEYS) {
        const v = progress?.[key];
        if (isGoalPercent(v)) numbers[key] = v;
      }
      const fields = {
        title: draft.title.trim(),
        practices,
        order: draft.order,
        updatedAt: serverTimestamp(),
      };
      if (draft.id) {
        const ref = doc(db, 'plcs', plcId, 'goals', draft.id);
        await updateDoc(ref, {
          ...fields,
          measure: measure.length > 0 ? measure : deleteField(),
          ...(progress
            ? Object.fromEntries(
                PLC_GOAL_PROGRESS_KEYS.map((k) => [
                  k,
                  k in numbers ? numbers[k] : deleteField(),
                ])
              )
            : {}),
        });
        return ref.id;
      }
      const ref = doc(collection(db, 'plcs', plcId, 'goals'));
      await setDoc(ref, {
        id: ref.id,
        ...fields,
        ...(measure.length > 0 ? { measure } : {}),
        ...numbers,
        createdBy: uid,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    },
    [plcId, uid]
  );

  const deleteGoal = useCallback(
    async (goalId: string) => {
      if (!plcId || !uid) return;
      await deleteDoc(doc(db, 'plcs', plcId, 'goals', goalId));
    },
    [plcId, uid]
  );

  return {
    goals: current ? state.goals : [],
    loading: !!plcId && !!uid && !isAuthBypass && !(current && state.loaded),
    error: current ? state.error : null,
    saveGoal,
    deleteGoal,
  };
}
