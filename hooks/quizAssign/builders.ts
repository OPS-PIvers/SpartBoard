import type {
  AssignmentMode,
  ClassRoster,
  PlcLinkage,
  QuizAssignmentSettings,
  QuizConfig,
  QuizData,
  QuizMetadata,
  QuizQuestion,
  QuizSessionBankSlot,
  QuizSessionMode,
  QuizSessionOptions,
  QuizStimulus,
  QuizTranslationIndexEntry,
  QuizWidgetKind,
} from '@/types';
import type {
  AssignmentQuizRef,
  CreateAssignmentOptions,
} from '@/hooks/quizAssignments/types';
import type { SetAssignmentTargetsCallInput } from '@/hooks/useSetAssignmentTargets';
import { withQuizAnswerChoices } from '@/components/common/library/assignStepper/modificationGroups';
import {
  buildMixedTargetsPayload,
  expandMixedTargeting,
  type AssignClassesValue,
  type MixedTargeting,
} from '@/utils/assignTargets';
import { dueAtByClassIdFromRosters } from '@/utils/perClassDueDates';
import { buildPeriodGate, initialAssignStatus } from '@/utils/periodPlan';
import { translateHiddenOptionIdsToText } from '@/utils/quizHiddenOptions';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import {
  buildSetAssignmentTargetsPayload,
  expandClassTargeting,
  payloadRequiresCall,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';

type PeriodGateInput = Parameters<typeof buildPeriodGate>[0];
type PeriodGate = ReturnType<typeof buildPeriodGate>;
type SessionTargets = ReturnType<typeof deriveSessionTargetsFromRosters>;

/** The assign dialog's PLC and period fields the builders read. */
export interface AssignPlcFields {
  plcMode: boolean;
  teacherName?: string;
  periodName?: string;
  periodNames?: string[];
  plcPoolSyncGroupId?: string;
}

export interface ResolvedAssignTargeting {
  /** Messages for options that could not be hidden; the handler toasts them. */
  warnings: string[];
  /** Set only for a stepper assign. */
  mixedTargeting: MixedTargeting | undefined;
  resolvedTargeting: AssignTargetingValue;
}

/** Hidden option ids become option text, then classes expand to their students. */
export function resolveAssignTargeting({
  questions,
  assignQuestions,
  targeting,
  stepperClasses,
  rosters,
  rosterIds,
}: {
  /** The quiz's own questions, which the hidden option ids refer to. */
  questions: QuizQuestion[];
  /** The questions being assigned (the bank draw when the quiz has bank slots). */
  assignQuestions: QuizQuestion[];
  targeting: AssignTargetingValue;
  stepperClasses: AssignClassesValue | undefined;
  rosters: ClassRoster[];
  rosterIds: string[];
}): ResolvedAssignTargeting {
  const hiddenOptions = translateHiddenOptionIdsToText(
    questions,
    targeting.overridesByKey
  );
  const targetingWithOptions: AssignTargetingValue = {
    ...targeting,
    overridesByKey: hiddenOptions.overridesByKey,
  };
  // Class answer choices become this quiz's hidden options for each student.
  const withAnswerChoices = (
    value: AssignTargetingValue
  ): AssignTargetingValue => ({
    ...value,
    overridesByKey: withQuizAnswerChoices(
      value.overridesByKey,
      assignQuestions
    ),
  });
  // Stepper: whole classes as today, narrowed classes to their picked students (D5b).
  const rawMixed = stepperClasses
    ? expandMixedTargeting(targetingWithOptions, stepperClasses, rosters)
    : undefined;
  const mixedTargeting = rawMixed && {
    ...rawMixed,
    targeting: withAnswerChoices(rawMixed.targeting),
  };
  const resolvedTargeting: AssignTargetingValue =
    mixedTargeting?.targeting ??
    withAnswerChoices(
      expandClassTargeting(targetingWithOptions, {
        rosters,
        selectedRosterIds: rosterIds,
      })
    );
  return {
    warnings: hiddenOptions.warnings,
    mixedTargeting,
    resolvedTargeting,
  };
}

export interface AssignSessionTargets {
  derived: SessionTargets;
  periodGate: PeriodGate;
  sessionPeriodAccess: NonNullable<PeriodGate>['periodAccess'] | null;
}

/** Session class ids from the picked rosters, plus the per-period gate for a student-paced assign. */
export function buildAssignSessionTargets({
  mode,
  rosters,
  rosterIds,
  periodPlan,
  sharedWindow,
  bellWindow,
  manualStart,
}: {
  mode: QuizSessionMode;
  rosters: ClassRoster[];
  rosterIds: string[];
  periodPlan: PeriodGateInput['plan'];
  sharedWindow: PeriodGateInput['sharedWindow'];
  bellWindow: PeriodGateInput['bellWindow'];
  manualStart: boolean | undefined;
}): AssignSessionTargets {
  const selectedRosters = rosters.filter((r) => rosterIds.includes(r.id));
  const derived = deriveSessionTargetsFromRosters(selectedRosters);
  const periodGate =
    mode === 'student'
      ? buildPeriodGate({
          plan: periodPlan,
          rosters: selectedRosters,
          sharedWindow,
          bellWindow,
          manualStart,
        })
      : undefined;
  return {
    derived,
    periodGate,
    sessionPeriodAccess: periodGate?.periodAccess ?? null,
  };
}

/** The quiz reference `createAssignment` stores: the assigned questions under the library quiz's id and title. */
export function buildAssignQuizRef({
  meta,
  data,
  driveFileId,
  questions,
  stimuli,
}: {
  meta: Pick<QuizMetadata, 'id' | 'title'>;
  data: Pick<QuizData, 'language' | 'order' | 'sections'>;
  driveFileId: string;
  questions: QuizQuestion[];
  stimuli: QuizStimulus[] | undefined;
}): AssignmentQuizRef {
  return {
    id: meta.id,
    title: meta.title,
    driveFileId,
    questions,
    ...(stimuli ? { stimuli } : {}),
    ...(data.language ? { language: data.language } : {}),
    ...(data.sections?.length
      ? { order: data.order, sections: data.sections }
      : {}),
  };
}

/** The assignment's settings as `createAssignment` takes them. */
export function buildAssignSettings({
  mode,
  sessionOptions,
  attemptLimit,
  dueAt,
  dueAtByRosterId,
  plcOptions,
  plcLinkage,
  resolvedDriveFileId,
  frozenDriveFileId,
}: {
  mode: QuizSessionMode;
  sessionOptions: QuizSessionOptions;
  attemptLimit: QuizAssignmentSettings['attemptLimit'];
  dueAt: number | null;
  dueAtByRosterId: Record<string, number> | undefined;
  plcOptions: AssignPlcFields;
  plcLinkage: PlcLinkage | undefined;
  resolvedDriveFileId: string | undefined;
  frozenDriveFileId: string | undefined;
}): QuizAssignmentSettings {
  return {
    sessionMode: mode,
    sessionOptions,
    attemptLimit,
    dueAt: dueAt ?? undefined,
    dueAtHasTime: dueAt != null ? true : undefined,
    ...(dueAtByRosterId ? { dueAtByRosterId } : {}),
    teacherName: plcOptions.teacherName,
    periodName: plcOptions.periodNames?.[0] ?? plcOptions.periodName,
    periodNames: plcOptions.periodNames,
    plc: plcLinkage,
    ...(resolvedDriveFileId ? { resolvedDriveFileId } : {}),
    ...(frozenDriveFileId ? { frozenDriveFileId } : {}),
  };
}

/** The session options `createAssignment` takes; `now` is read by the caller. */
export function buildAssignCreateOptions({
  widgetKind,
  assignmentMode,
  mode,
  now,
  stepper,
  rosters,
  rosterIds,
  derived,
  periodGate,
  sessionPeriodAccess,
  resolvedTargeting,
  dueAt,
  dueAtByRosterId,
  sessionBankSlots,
  paperWritten,
  plcLinkage,
  plcPoolSyncGroupId,
  plcTemplateSyncGroupId,
  districtCopy,
  translationIndex,
}: {
  widgetKind: QuizWidgetKind;
  assignmentMode: AssignmentMode;
  mode: QuizSessionMode;
  now: number;
  /** The stepper's start and audience picks; undefined for an assign outside the stepper. */
  stepper:
    | { manualStart: boolean; audience?: CreateAssignmentOptions['audience'] }
    | undefined;
  rosters: ClassRoster[];
  rosterIds: string[];
  derived: Pick<
    SessionTargets,
    'classIds' | 'rosterIds' | 'classPeriodByClassId'
  >;
  periodGate: PeriodGate;
  sessionPeriodAccess: AssignSessionTargets['sessionPeriodAccess'];
  resolvedTargeting: AssignTargetingValue;
  dueAt: number | null;
  dueAtByRosterId: Record<string, number> | undefined;
  sessionBankSlots: QuizSessionBankSlot[] | undefined;
  paperWritten: CreateAssignmentOptions['paperWritten'] | null;
  plcLinkage: PlcLinkage | undefined;
  plcPoolSyncGroupId: string | undefined;
  plcTemplateSyncGroupId: string | undefined;
  /** A District library copy: teammates can't join its canonical, so no PLC template. */
  districtCopy: boolean;
  translationIndex: Record<string, QuizTranslationIndexEntry> | undefined;
}): CreateAssignmentOptions {
  return {
    widgetKind,
    // A per-period session is gated by its periods, a later Scheduled start by its open time.
    initialStatus: initialAssignStatus({
      gated: !!sessionPeriodAccess,
      opensLater:
        !!stepper &&
        !stepper.manualStart &&
        mode === 'student' &&
        rosterIds.length > 0 &&
        (resolvedTargeting.openAt ?? 0) > now,
    }),
    ...(sessionPeriodAccess
      ? {
          accessMode: periodGate?.accessMode,
          periodAccess: sessionPeriodAccess,
        }
      : {}),
    ...(sessionBankSlots ? { bankSlots: sessionBankSlots } : {}),
    ...(paperWritten ? { paperWritten } : {}),
    ...(stepper?.audience === 'staff' ? { audience: 'staff' as const } : {}),
    classIds: derived.classIds,
    rosterIds: derived.rosterIds,
    classPeriodByClassId: derived.classPeriodByClassId,
    ...(dueAtByRosterId
      ? {
          dueAtByClassId: dueAtByClassIdFromRosters(dueAtByRosterId, rosters),
        }
      : {}),
    mode: assignmentMode,
    ...(plcTemplateSyncGroupId ? { plcTemplateSyncGroupId } : {}),
    ...(districtCopy ? { skipPlcTemplateWrite: true } : {}),
    ...(plcLinkage && plcPoolSyncGroupId ? { plcPoolSyncGroupId } : {}),
    // `targetMode` and `targetStudents` are written by `setAssignmentTargetsV1`, never here.
    targetGroupIds: resolvedTargeting.targetGroupIds,
    overridesBySourcedId: resolvedTargeting.overridesByKey,
    openAt: resolvedTargeting.openAt ?? null,
    closeAt: resolvedTargeting.closeAt ?? null,
    ...(stepper?.manualStart &&
    resolvedTargeting.closeAt == null &&
    dueAt != null
      ? { manualLate: true }
      : {}),
    ...(resolvedTargeting.workKind
      ? { workKind: resolvedTargeting.workKind }
      : {}),
    ...(translationIndex ? { translationIndex } : {}),
    lenientTranslatedFib: true,
  };
}

/** The `setAssignmentTargetsV1` input for a new assignment, or null when a class-wide assign needs no call. */
export function buildAssignTargetsCall({
  assignmentId,
  mixedTargeting,
  resolvedTargeting,
}: {
  assignmentId: string;
  mixedTargeting: MixedTargeting | undefined;
  resolvedTargeting: AssignTargetingValue;
}): SetAssignmentTargetsCallInput | null {
  const payload = mixedTargeting
    ? buildMixedTargetsPayload(undefined, mixedTargeting)
    : buildSetAssignmentTargetsPayload(undefined, resolvedTargeting);
  if (!payloadRequiresCall(payload)) return null;
  return {
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
  };
}

/** The widget config after an assign: the Assigned tab, with this quiz's last-used classes remembered. */
export function buildAssignedWidgetConfig({
  config,
  meta,
  assignmentId,
  plcOptions,
  rosterIds,
}: {
  config: QuizConfig;
  meta: Pick<QuizMetadata, 'id' | 'title'>;
  assignmentId: string;
  plcOptions: AssignPlcFields;
  rosterIds: string[];
}): QuizConfig {
  const prevMap = config.lastRosterIdsByQuizId ?? {};
  const nextMap: Record<string, string[]> = { ...prevMap };
  if (rosterIds.length > 0) {
    nextMap[meta.id] = rosterIds;
  } else {
    delete nextMap[meta.id];
  }
  return {
    ...config,
    view: 'manager',
    managerTab: 'active',
    selectedQuizId: meta.id,
    selectedQuizTitle: meta.title,
    activeAssignmentId: assignmentId,
    plcMode: plcOptions.plcMode,
    teacherName: plcOptions.teacherName ?? '',
    periodName: plcOptions.periodNames?.[0] ?? plcOptions.periodName ?? '',
    periodNames: plcOptions.periodNames ?? [],
    lastRosterIdsByQuizId: nextMap,
  };
}
