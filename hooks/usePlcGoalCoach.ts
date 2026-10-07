// Calls the PLC goal coach (docs/plans/TEAMS_REDESIGN.md T22); gate the UI with canAccessFeature('plc-goal-coach').
import { useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { GoalCoachDraft, GoalCoachResult } from '@/config/goalCoachRubric';

export function usePlcGoalCoach(plcId: string) {
  return useCallback(
    async (goal: GoalCoachDraft): Promise<GoalCoachResult> => {
      const call = httpsCallable<
        { plcId: string; goal: GoalCoachDraft },
        GoalCoachResult
      >(functions, 'plcGoalCoachV1');
      return (await call({ plcId, goal })).data;
    },
    [plcId]
  );
}
