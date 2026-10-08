// Resolves the assign stepper's Mini App choices into what the session, archive row and callable write (docs/plans/ASSIGN_STEPPER.md D20).
import type { ClassRoster } from '@/types';
import type { AssignClassesValue } from '@/components/common/library/assignStepper/assignClassesValue';
import type { AssignWhenValue } from '@/components/common/library/assignStepper/assignWhenValue';
import type { AssignKind } from '@/components/common/library/assignStepper/assignSteps';
import {
  applyWhen,
  manualStartAvailable,
  type BellWindowFn,
} from '@/utils/assignAvailability';
import { buildPeriodGate } from '@/utils/periodPlan';
import {
  buildMixedTargetsPayload,
  expandMixedTargeting,
} from '@/utils/assignTargets';
import type {
  AssignTargetingValue,
  SetAssignmentTargetsPayload,
} from '@/utils/studentTargetRef';

export interface MiniAppStepperChoices {
  kind: AssignKind;
  classes: AssignClassesValue;
  when: AssignWhenValue;
  /** Modifications and skips from the Modifications view. */
  targeting: AssignTargetingValue;
}

export interface MiniAppStepperAssignPlan {
  /** Picked classes whose students loaded. */
  selectedRosters: ClassRoster[];
  /** Windows, work kind and per-student targets resolved for saving. */
  targeting: AssignTargetingValue;
  periodGate: ReturnType<typeof buildPeriodGate>;
  payload: SetAssignmentTargetsPayload;
}

export function planMiniAppStepperAssign(
  choices: MiniAppStepperChoices,
  {
    rosters,
    bellWindow,
    now = new Date(),
  }: {
    rosters: ClassRoster[];
    bellWindow: BellWindowFn | undefined;
    now?: Date;
  }
): MiniAppStepperAssignPlan {
  const { kind, classes, when, targeting } = choices;
  const picked = new Set(classes.classIds);
  const selectedRosters = rosters.filter(
    (r) => picked.has(r.id) && !r.loadError
  );
  const { targeting: saved } = applyWhen(
    { ...targeting, availability: when.availability, workKind: kind },
    {
      mode: when.mode,
      rosters: selectedRosters,
      bellWindow,
      workKind: { default: kind, locked: true },
      now,
    }
  );
  const periodGate = buildPeriodGate({
    plan: saved.periodPlan,
    rosters: selectedRosters,
    sharedWindow: saved,
    bellWindow,
    manualStart:
      when.mode === 'manual' &&
      kind === 'work' &&
      manualStartAvailable(bellWindow),
  });
  const mixed = expandMixedTargeting(
    saved,
    {
      classIds: selectedRosters.map((r) => r.id),
      studentsByClass: classes.studentsByClass,
    },
    rosters
  );
  // A per-period session's pointers carry no shared window.
  const payload = buildMixedTargetsPayload(
    undefined,
    periodGate
      ? {
          ...mixed,
          targeting: {
            ...mixed.targeting,
            openAt: undefined,
            closeAt: undefined,
          },
        }
      : mixed
  );
  return {
    selectedRosters,
    targeting: mixed.targeting,
    periodGate,
    payload,
  };
}
