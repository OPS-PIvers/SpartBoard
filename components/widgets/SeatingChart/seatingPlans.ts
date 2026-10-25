import type { SeatingChartConfig, SeatingPlan } from '@/types';

export const MAX_SEATING_PLANS = 12;
export const MAX_PLAN_NAME_LENGTH = 40;

type PlanPatch = Pick<
  SeatingChartConfig,
  'savedPlans' | 'activePlanId' | 'assignments'
>;

export const cleanPlanName = (raw: string): string =>
  raw.trim().replace(/\s+/g, ' ').slice(0, MAX_PLAN_NAME_LENGTH);

export const getActivePlan = (config: SeatingChartConfig): SeatingPlan | null =>
  config.savedPlans?.find((p) => p.id === config.activePlanId) ?? null;

// Writes the live seats back into the active plan so switching away never loses edits.
const withActiveSnapshot = (config: SeatingChartConfig): SeatingPlan[] => {
  const plans = config.savedPlans ?? [];
  const active = getActivePlan(config);
  if (!active) return plans;
  return plans.map((p) =>
    p.id === active.id
      ? { ...p, assignments: { ...(config.assignments ?? {}) } }
      : p
  );
};

const pruneToFurniture = (
  assignments: Record<string, string>,
  furnitureIds: Set<string>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(assignments).filter(([, seatId]) => furnitureIds.has(seatId))
  );

export const saveAsNewPlan = (
  config: SeatingChartConfig,
  name: string,
  id: string = crypto.randomUUID()
): PlanPatch => {
  const plan: SeatingPlan = {
    id,
    name: cleanPlanName(name),
    assignments: { ...(config.assignments ?? {}) },
  };
  return {
    savedPlans: [...withActiveSnapshot(config), plan],
    activePlanId: id,
    assignments: config.assignments ?? {},
  };
};

export const switchPlan = (
  config: SeatingChartConfig,
  targetId: string
): PlanPatch | null => {
  const plans = withActiveSnapshot(config);
  const target = plans.find((p) => p.id === targetId);
  if (!target) return null;
  const furnitureIds = new Set((config.furniture ?? []).map((f) => f.id));
  return {
    savedPlans: plans,
    activePlanId: targetId,
    assignments: pruneToFurniture(target.assignments, furnitureIds),
  };
};

export const renamePlan = (
  config: SeatingChartConfig,
  planId: string,
  name: string
): Pick<SeatingChartConfig, 'savedPlans'> => ({
  savedPlans: (config.savedPlans ?? []).map((p) =>
    p.id === planId ? { ...p, name: cleanPlanName(name) } : p
  ),
});

// Deleting the plan on screen moves to the next saved plan; with none left the seats stay, unsaved.
export const deletePlan = (
  config: SeatingChartConfig,
  planId: string
): PlanPatch => {
  const remaining = (config.savedPlans ?? []).filter((p) => p.id !== planId);
  if (config.activePlanId !== planId) {
    return {
      savedPlans: remaining,
      activePlanId: config.activePlanId ?? null,
      assignments: config.assignments ?? {},
    };
  }
  const next = remaining[0];
  if (!next) {
    return {
      savedPlans: remaining,
      activePlanId: null,
      assignments: config.assignments ?? {},
    };
  }
  const furnitureIds = new Set((config.furniture ?? []).map((f) => f.id));
  return {
    savedPlans: remaining,
    activePlanId: next.id,
    assignments: pruneToFurniture(next.assignments, furnitureIds),
  };
};

export const hasUnsavedSeats = (config: SeatingChartConfig): boolean =>
  getActivePlan(config) === null &&
  Object.keys(config.assignments ?? {}).length > 0;
