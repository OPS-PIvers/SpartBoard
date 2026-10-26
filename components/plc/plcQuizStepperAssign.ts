// What the assign stepper adds to a PLC quiz assign (D21): classes, student picks and When.
import type {
  AccessMode,
  ClassRoster,
  PeriodAccess,
  QuizAssignmentSettings,
} from '@/types';
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
import {
  dueAtByClassIdFromRosters,
  earliestDueAt,
} from '@/utils/perClassDueDates';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  payloadRequiresCall,
} from '@/utils/studentTargetRef';
import { buildMixedTargetsPayload } from '@/utils/assignTargets';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import { skippedTargetsToastMessage } from '@/utils/assignTargetingSkippedToast';
import { logError } from '@/utils/logError';
import type {
  SetAssignmentTargetsCallInput,
  SetAssignmentTargetsCallResult,
} from '@/hooks/useSetAssignmentTargets';
import type { CreateAssignmentOptions } from '@/hooks/useQuizAssignments';
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

/** The createAssignment settings and options a stepper plan sets: classes, dates and the period gate. */
export function plcStepperCreateFields(
  plan: PlcQuizStepperPlan,
  rosters: ClassRoster[]
): {
  settings: Pick<
    QuizAssignmentSettings,
    'periodName' | 'periodNames' | 'dueAt' | 'dueAtHasTime' | 'dueAtByRosterId'
  >;
  options: CreateAssignmentOptions;
} {
  const derived = deriveSessionTargetsFromRosters(plan.rosters);
  const targeting = plan.mixed.targeting;
  return {
    settings: {
      periodName: derived.periodNames[0],
      periodNames: derived.periodNames,
      ...(plan.dueAt != null ? { dueAt: plan.dueAt, dueAtHasTime: true } : {}),
      ...(plan.dueAtByRosterId
        ? { dueAtByRosterId: plan.dueAtByRosterId }
        : {}),
    },
    options: {
      // A per-period session is gated by its periods, not a global pause.
      initialStatus: plan.periodGate ? 'active' : 'paused',
      ...(plan.periodGate ?? {}),
      classIds: derived.classIds,
      rosterIds: derived.rosterIds,
      classPeriodByClassId: derived.classPeriodByClassId,
      ...(plan.dueAtByRosterId
        ? {
            dueAtByClassId: dueAtByClassIdFromRosters(
              plan.dueAtByRosterId,
              rosters
            ),
          }
        : {}),
      ...(targeting
        ? {
            targetGroupIds: targeting.targetGroupIds,
            overridesBySourcedId: targeting.overridesByKey,
            openAt: targeting.openAt ?? null,
            closeAt: targeting.closeAt ?? null,
          }
        : {}),
    },
  };
}

/** Fans out the stepper's student picks after create, like the Quiz widget's stepper assign (D5b). */
export async function applyPlcStepperStudentPicks({
  assignmentId,
  plan,
  setAssignmentTargets,
  setAssignmentTargetSkippedCount,
  addToast,
  logScope,
}: {
  assignmentId: string;
  plan: PlcQuizStepperPlan;
  setAssignmentTargets: (
    input: SetAssignmentTargetsCallInput
  ) => Promise<SetAssignmentTargetsCallResult>;
  setAssignmentTargetSkippedCount: (
    assignmentId: string,
    count: number
  ) => Promise<void>;
  addToast: (message: string, type: 'warning' | 'error') => void;
  logScope: string;
}): Promise<void> {
  const payload = buildMixedTargetsPayload(undefined, plan.mixed);
  if (!payloadRequiresCall(payload)) return;
  try {
    const result = await setAssignmentTargets({
      assignmentId,
      kind: 'quiz',
      sessionId: assignmentId,
      targetMode: payload.targetMode,
      add: payload.add,
      remove: payload.remove,
      overridesBySourcedId: payload.overridesBySourcedId,
      ...(payload.excludedTargets
        ? { excludedTargets: payload.excludedTargets }
        : {}),
      ...(payload.studentTargetClassIds
        ? { studentTargetClassIds: payload.studentTargetClassIds }
        : {}),
      window: payload.window,
    });
    if (result.skipped.length > 0) {
      addToast(
        skippedTargetsToastMessage(
          result.skipped.length,
          result.skippedExclusions?.length ?? 0
        ),
        'warning'
      );
      try {
        await setAssignmentTargetSkippedCount(
          assignmentId,
          result.skipped.length
        );
      } catch (persistErr) {
        logError(`${logScope}.setAssignmentTargetSkippedCount`, persistErr, {
          assignmentId,
        });
      }
    }
  } catch (targetErr) {
    logError(`${logScope}.setAssignmentTargets`, targetErr, { assignmentId });
    addToast(
      'Assigned to the class, but individual student targeting failed to save. Reopen Settings to retry.',
      'error'
    );
  }
}
