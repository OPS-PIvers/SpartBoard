// What the assign stepper adds to a PLC quiz assign (D21): classes, student picks and When.
import type { AccessMode, ClassRoster, PeriodAccess } from '@/types';
import {
  applyWhen,
  manualStartAvailable,
  type BellWindowFn,
} from '@/utils/assignAvailability';
import {
  expandMixedTargeting,
  type AssignClassesValue,
  type MixedTargeting,
} from '@/utils/assignTargets';
import { buildPeriodGate } from '@/utils/periodPlan';
import { earliestDueAt } from '@/utils/perClassDueDates';
import { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';
import type { AssignWhenValue } from '@/components/common/library/assignStepper/assignWhenValue';

export interface PlcQuizStepperPlan {
  rosters: ClassRoster[];
  dueAt: number | null;
  dueAtByRosterId?: Record<string, number>;
  mixed: MixedTargeting;
  periodGate?: {
    accessMode: AccessMode;
    periodAccess: Record<string, PeriodAccess>;
  };
}

export function planPlcQuizStepperAssign({
  classes,
  when,
  rosters,
  bellWindow,
}: {
  classes: AssignClassesValue;
  when: AssignWhenValue;
  rosters: ClassRoster[];
  bellWindow: BellWindowFn | undefined;
}): PlcQuizStepperPlan {
  const picked = rosters.filter(
    (r) => !r.loadError && classes.classIds.includes(r.id)
  );
  const pickedIds = picked.map((r) => r.id);
  const applied = applyWhen(
    { ...EMPTY_ASSIGN_TARGETING_VALUE, availability: when.availability },
    { mode: when.mode, rosters: picked, bellWindow }
  );
  const studentsByClass = Object.fromEntries(
    Object.entries(classes.studentsByClass).filter(([id]) =>
      pickedIds.includes(id)
    )
  );
  const mixed = expandMixedTargeting(
    applied.targeting,
    { classIds: pickedIds, studentsByClass },
    rosters
  );
  const periodGate = buildPeriodGate({
    plan: applied.targeting.periodPlan,
    rosters: picked,
    sharedWindow: mixed.targeting,
    bellWindow,
    manualStart: when.mode === 'manual' && manualStartAvailable(bellWindow),
  });
  const perClassDue = applied.dueAtByRosterId;
  return {
    rosters: picked,
    dueAt: perClassDue
      ? earliestDueAt(perClassDue)
      : (applied.targeting.dueAt ?? null),
    ...(perClassDue ? { dueAtByRosterId: perClassDue } : {}),
    mixed,
    ...(periodGate ? { periodGate } : {}),
  };
}
