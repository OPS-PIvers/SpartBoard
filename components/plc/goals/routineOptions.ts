// Routines a group goal practice can link to, A to Z.

import { ROUTINES } from '@/config/instructionalRoutines';

export interface GoalRoutineOption {
  id: string;
  name: string;
}

const OPTIONS: GoalRoutineOption[] = ROUTINES.map((r) => ({
  id: r.id,
  name: r.name,
})).sort((a, b) => a.name.localeCompare(b.name));

export function useGoalRoutineOptions(): GoalRoutineOption[] {
  return OPTIONS;
}

export function routineNameFor(
  options: readonly GoalRoutineOption[],
  routineId: string
): string | null {
  return options.find((o) => o.id === routineId)?.name ?? null;
}
