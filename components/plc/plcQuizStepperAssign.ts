// What the assign stepper adds to a PLC quiz assign (D21): classes, student picks and When.
import type {
  AccessMode,
  AssignmentMode,
  ClassRoster,
  PeriodAccess,
  PlcLinkage,
  QuizAssignmentSettings,
  QuizBehaviorSettings,
  QuizQuestion,
  QuizTranslationIndexEntry,
} from '@/types';
import { withQuizAnswerChoices } from '@/components/common/library/assignStepper/modificationGroups';
import {
  applyAssignTargetsCall,
  buildAssignCreateOptions,
  buildAssignSettings,
  buildAssignTargetsCall,
  saveAssignFinalScore,
} from '@/hooks/quizAssign/builders';
import type { QuizAssignContent } from '@/utils/quizAssignBankDraw';
import { applyWhen, type BellWindowFn } from '@/utils/assignAvailability';
import {
  expandMixedTargeting,
  type AssignClassesValue,
  type MixedTargeting,
} from '@/utils/assignTargets';
import { buildPeriodGate } from '@/utils/periodPlan';
import { earliestDueAt } from '@/utils/perClassDueDates';
import { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import type {
  SetAssignmentTargetsCallInput,
  SetAssignmentTargetsCallResult,
} from '@/hooks/useSetAssignmentTargets';
import type { CreateAssignmentOptions } from '@/hooks/quizAssignments/types';
import type { AssignWhenValue } from '@/components/common/library/assignStepper/assignWhenValue';

export interface PlcQuizStepperPlan {
  rosters: ClassRoster[];
  /** Manual When: it starts when the teacher presses Start. */
  manualStart: boolean;
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
  questions,
}: {
  classes: AssignClassesValue;
  when: AssignWhenValue;
  rosters: ClassRoster[];
  bellWindow: BellWindowFn | undefined;
  /** The quiz's questions, so class answer choices become hidden options. */
  questions?: QuizQuestion[];
}): PlcQuizStepperPlan {
  const picked = rosters.filter(
    (r) => !r.loadError && classes.classIds.includes(r.id)
  );
  const pickedIds = picked.map((r) => r.id);
  const applied = applyWhen(
    { ...EMPTY_ASSIGN_TARGETING_VALUE, availability: when.availability },
    { mode: when.mode, manualAvailable: true, rosters: picked, bellWindow }
  );
  const studentsByClass = Object.fromEntries(
    Object.entries(classes.studentsByClass).filter(([id]) =>
      pickedIds.includes(id)
    )
  );
  const expanded = expandMixedTargeting(
    applied.targeting,
    { classIds: pickedIds, studentsByClass },
    rosters
  );
  const mixed = questions
    ? withPlanAnswerChoices(expanded, questions)
    : expanded;
  const periodGate = buildPeriodGate({
    plan: applied.targeting.periodPlan,
    rosters: picked,
    sharedWindow: mixed.targeting,
    bellWindow,
    manualStart: when.mode === 'manual',
  });
  const perClassDue = applied.dueAtByRosterId;
  return {
    rosters: picked,
    manualStart: when.mode === 'manual',
    dueAt: perClassDue
      ? earliestDueAt(perClassDue)
      : (applied.targeting.dueAt ?? null),
    ...(perClassDue ? { dueAtByRosterId: perClassDue } : {}),
    mixed,
    ...(periodGate ? { periodGate } : {}),
  };
}

/** Turns class answer choices into this quiz's hidden options, once the questions are loaded. */
export function withPlanAnswerChoices(
  mixed: MixedTargeting,
  questions: QuizQuestion[]
): MixedTargeting {
  if (!mixed?.targeting) return mixed;
  return {
    ...mixed,
    targeting: {
      ...mixed.targeting,
      overridesByKey: withQuizAnswerChoices(
        mixed.targeting.overridesByKey,
        questions
      ),
    },
  };
}

/** The createAssignment settings and options for a PLC stepper assign, from the Quiz widget's builders. */
export function plcStepperCreateFields(
  plan: PlcQuizStepperPlan,
  rosters: ClassRoster[],
  {
    behavior,
    teacherName,
    content,
    assignmentMode,
    plcLinkage,
    plcPoolSyncGroupId,
    plcTemplateSyncGroupId,
    skipPlcTemplateWrite,
    syncedFrom,
    translationIndex,
  }: {
    behavior: Pick<
      QuizBehaviorSettings,
      'sessionMode' | 'sessionOptions' | 'attemptLimit'
    >;
    teacherName: string | undefined;
    content: QuizAssignContent;
    assignmentMode: AssignmentMode;
    plcLinkage: PlcLinkage | undefined;
    plcPoolSyncGroupId?: string;
    plcTemplateSyncGroupId?: string;
    skipPlcTemplateWrite?: boolean;
    syncedFrom?: CreateAssignmentOptions['syncedFrom'];
    translationIndex?: Record<string, QuizTranslationIndexEntry>;
  }
): {
  settings: QuizAssignmentSettings;
  options: CreateAssignmentOptions;
} {
  const derived = deriveSessionTargetsFromRosters(plan.rosters);
  const rosterIds = plan.rosters.map((r) => r.id);
  const plcOptions = {
    plcMode: !!plcLinkage,
    teacherName,
    periodNames: derived.periodNames,
  };
  return {
    settings: buildAssignSettings({
      mode: behavior.sessionMode,
      sessionOptions: behavior.sessionOptions,
      attemptLimit: behavior.attemptLimit,
      dueAt: plan.dueAt,
      dueAtByRosterId: plan.dueAtByRosterId,
      plcOptions,
      plcLinkage,
      resolvedDriveFileId: content.resolvedDriveFileId,
      frozenDriveFileId: content.frozenDriveFileId,
    }),
    options: buildAssignCreateOptions({
      assignmentMode,
      mode: behavior.sessionMode,
      now: Date.now(),
      stepper: { manualStart: plan.manualStart },
      rosters,
      rosterIds,
      derived,
      periodGate: plan.periodGate,
      sessionPeriodAccess: plan.periodGate?.periodAccess ?? null,
      resolvedTargeting: plan.mixed.targeting ?? EMPTY_ASSIGN_TARGETING_VALUE,
      dueAt: plan.dueAt,
      dueAtByRosterId: plan.dueAtByRosterId,
      sessionBankSlots: content.bankSlots,
      paperWritten: null,
      plcLinkage,
      plcPoolSyncGroupId,
      plcTemplateSyncGroupId,
      districtCopy: false,
      translationIndex,
      skipPlcTemplateWrite,
      syncedFrom,
    }),
  };
}

/** Saves the picked Final score to the gradebook column, as the Quiz widget's assign does. */
export function savePlcStepperFinalScore(
  args: Parameters<typeof saveAssignFinalScore>[0]
): void {
  saveAssignFinalScore(args);
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
  await applyAssignTargetsCall({
    targetsCall: buildAssignTargetsCall({
      assignmentId,
      mixedTargeting: plan.mixed,
      resolvedTargeting: plan.mixed.targeting,
    }),
    setAssignmentTargets,
    setAssignmentTargetSkippedCount,
    notify: addToast,
    logScope,
  });
}
